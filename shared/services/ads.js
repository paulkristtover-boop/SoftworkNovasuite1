const pool = require('../database/pool');
const config = require('../config');
const { ValidationError, NotFoundError, InsufficientBalanceError } = require('../utils/errors');
const { adjustBalance } = require('./users');
const { logAudit } = require('./audit');

const AD_TYPES = ['bot', 'website', 'channel', 'group', 'other'];

async function getSettings() {
  const { rows } = await pool.query(`SELECT * FROM ptc_settings ORDER BY id LIMIT 1`);
  const s = rows[0] || {};
  return {
    default_reward: s.default_reward ?? config.ptc.defaultReward,
    min_campaign_budget: s.min_campaign_budget ?? config.ptc.minBudget,
    min_reward_per_view: s.min_reward_per_view ?? config.ptc.minReward,
    max_reward_per_view: s.max_reward_per_view ?? config.ptc.maxReward,
    referral_signup_bonus: s.referral_signup_bonus ?? 0.05,
    referral_welcome_bonus: s.referral_welcome_bonus ?? 0.02,
    referral_earn_percent: s.referral_earn_percent ?? 5,
    daily_view_limit: s.daily_view_limit ?? 50,
    claim_delay_seconds: s.claim_delay_seconds ?? 15,
    daily_checkin_base: s.daily_checkin_base ?? 0.01,
    daily_checkin_streak_bonus: s.daily_checkin_streak_bonus ?? 0.002,
  };
}

/**
 * Create campaign: locks budget from advertiser balance, status = pending (admin approval).
 */
async function createCampaign({
  advertiserId,
  adType,
  title,
  description,
  targetUrl,
  rewardPerView,
  budgetTotal,
}) {
  if (!AD_TYPES.includes(adType)) {
    throw new ValidationError(`Ad type must be one of: ${AD_TYPES.join(', ')}`);
  }
  const settings = await getSettings();
  const budget = Number(budgetTotal);
  const reward = Number(rewardPerView) || Number(settings.default_reward);

  if (!title || title.trim().length < 3) throw new ValidationError('Title is required (min 3 chars).');
  if (!targetUrl || String(targetUrl).trim().length < 5) {
    throw new ValidationError('Valid link / username required.');
  }
  if (budget < Number(settings.min_campaign_budget)) {
    throw new ValidationError(`Minimum budget is ${settings.min_campaign_budget} USDT.`);
  }
  if (reward < Number(settings.min_reward_per_view) || reward > Number(settings.max_reward_per_view)) {
    throw new ValidationError(
      `Reward per view must be between ${settings.min_reward_per_view} and ${settings.max_reward_per_view} USDT.`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock advertiser funds
    const { rows: urows } = await client.query(
      `SELECT balance FROM users WHERE id = $1 FOR UPDATE`,
      [advertiserId]
    );
    if (!urows[0] || Number(urows[0].balance) < budget) {
      throw new InsufficientBalanceError('Insufficient balance to fund this campaign.');
    }
    await client.query(
      `UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
      [budget, advertiserId]
    );

    const estViews = Math.floor(budget / reward);
    const { rows } = await client.query(
      `INSERT INTO ad_campaigns
        (advertiser_id, ad_type, title, description, target_url, reward_per_view, budget_total, status, estimated_views)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
      [
        advertiserId,
        adType,
        title.trim(),
        description || null,
        String(targetUrl).trim(),
        reward,
        budget,
        estViews,
      ]
    );
    await client.query('COMMIT');

    await logAudit({
      actorUserId: advertiserId,
      action: 'campaign.create',
      entityType: 'ad_campaign',
      entityId: rows[0].id,
      details: { budget, reward, adType },
    });

    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getCampaign(id) {
  const { rows } = await pool.query(
    `SELECT c.*, u.telegram_id, u.username, u.first_name
     FROM ad_campaigns c JOIN users u ON u.id = c.advertiser_id
     WHERE c.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listActiveForViewer(viewerId, limit = 10) {
  // Active campaigns with remaining budget, not already viewed by this user, not own ads
  const { rows } = await pool.query(
    `SELECT c.*
     FROM ad_campaigns c
     WHERE c.status = 'active'
       AND c.budget_spent + c.reward_per_view <= c.budget_total
       AND c.advertiser_id != $1
       AND NOT EXISTS (
         SELECT 1 FROM ad_views v WHERE v.campaign_id = c.id AND v.viewer_id = $1
       )
     ORDER BY c.priority DESC, c.reward_per_view DESC, c.created_at ASC
     LIMIT $2`,
    [viewerId, limit]
  );
  return rows;
}

async function listUserCampaigns(advertiserId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT * FROM ad_campaigns WHERE advertiser_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [advertiserId, limit]
  );
  return rows;
}

async function listPendingCampaigns(limit = 50) {
  const { rows } = await pool.query(
    `SELECT c.*, u.telegram_id, u.username, u.first_name
     FROM ad_campaigns c JOIN users u ON u.id = c.advertiser_id
     WHERE c.status = 'pending' ORDER BY c.created_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function listCampaigns(status, limit = 50) {
  const params = [limit];
  let where = '';
  if (status && status !== 'all') {
    where = 'WHERE c.status = $2';
    params.push(status);
  }
  const { rows } = await pool.query(
    `SELECT c.*, u.telegram_id, u.username, u.first_name
     FROM ad_campaigns c JOIN users u ON u.id = c.advertiser_id
     ${where} ORDER BY c.created_at DESC LIMIT $1`,
    params
  );
  return rows;
}

/**
 * Record a view: pay viewer, debit campaign budget. Atomic.
 */

async function openClaimSession(campaignId, viewerId) {
  await pool.query(
    `INSERT INTO ad_claim_sessions (viewer_id, campaign_id, opened_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (viewer_id, campaign_id) DO UPDATE SET opened_at = NOW()`,
    [viewerId, campaignId]
  );
}

async function viewsToday(viewerId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM ad_views
     WHERE viewer_id = $1 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
    [viewerId]
  );
  return rows[0].c;
}

/**
 * Record a view: enforce daily limit + claim timer, pay viewer, referral share, debit campaign.
 */
async function recordView(campaignId, viewerId) {
  const { bumpEarnings } = require('./users');
  const { payEarnShare } = require('./referrals');
  const settings = await getSettings();
  const delay = Number(settings.claim_delay_seconds ?? 15);
  const dailyLimit = Number(settings.daily_view_limit ?? 50);

  const today = await viewsToday(viewerId);
  if (today >= dailyLimit) {
    throw new ValidationError(`Daily limit reached (${dailyLimit} ads). Try again tomorrow.`);
  }

  const { rows: sess } = await pool.query(
    `SELECT opened_at FROM ad_claim_sessions WHERE viewer_id = $1 AND campaign_id = $2`,
    [viewerId, campaignId]
  );
  if (!sess[0]) {
    throw new ValidationError('Open the ad link first, wait, then claim.');
  }
  const elapsed = (Date.now() - new Date(sess[0].opened_at).getTime()) / 1000;
  if (elapsed < delay) {
    const left = Math.ceil(delay - elapsed);
    throw new ValidationError(`Please wait ${left}s more before claiming (anti-bot).`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ad_campaigns WHERE id = $1 FOR UPDATE`,
      [campaignId]
    );
    const c = rows[0];
    if (!c) throw new NotFoundError('Campaign not found.');
    if (c.status !== 'active') throw new ValidationError('This ad is not active.');
    if (Number(c.advertiser_id) === Number(viewerId)) {
      throw new ValidationError('You cannot view your own ad for rewards.');
    }
    const reward = Number(c.reward_per_view);
    if (Number(c.budget_spent) + reward > Number(c.budget_total)) {
      throw new ValidationError('Campaign budget exhausted.');
    }

    try {
      await client.query(
        `INSERT INTO ad_views (campaign_id, viewer_id, reward) VALUES ($1, $2, $3)`,
        [campaignId, viewerId, reward]
      );
    } catch (err) {
      if (err.code === '23505') throw new ValidationError('You already earned from this ad.');
      throw err;
    }

    await client.query(
      `UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [reward, viewerId]
    );
    await bumpEarnings(client, viewerId, reward);
    await payEarnShare(client, viewerId, reward);

    const newSpent = Number(c.budget_spent) + reward;
    await client.query(
      `UPDATE ad_campaigns SET
         budget_spent = $1,
         views_count = views_count + 1,
         status = CASE WHEN $1 >= budget_total THEN 'finished' ELSE status END,
         updated_at = NOW()
       WHERE id = $2`,
      [newSpent, campaignId]
    );
    await client.query(
      `DELETE FROM ad_claim_sessions WHERE viewer_id = $1 AND campaign_id = $2`,
      [viewerId, campaignId]
    );

    await client.query('COMMIT');
    return { reward, campaign: await getCampaign(campaignId) };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function leaderboard(limit = 10) {
  const { rows } = await pool.query(
    `SELECT telegram_id, username, first_name, total_earned, total_views, level
     FROM users WHERE is_banned = FALSE
     ORDER BY total_earned DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return rows;
}


async function approveCampaign(id) {
  const { rows } = await pool.query(
    `UPDATE ad_campaigns SET status = 'active', reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new ValidationError('Campaign not found or not pending.');
  await logAudit({ action: 'campaign.approve', entityType: 'ad_campaign', entityId: id });
  return rows[0];
}

async function rejectCampaign(id, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ad_campaigns WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const c = rows[0];
    if (!c) throw new NotFoundError('Campaign not found.');
    if (c.status !== 'pending') throw new ValidationError(`Already ${c.status}.`);

    // Refund remaining budget (full budget since nothing spent)
    const refund = Number(c.budget_total) - Number(c.budget_spent);
    if (refund > 0) {
      await client.query(
        `UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
        [refund, c.advertiser_id]
      );
    }
    await client.query(
      `UPDATE ad_campaigns SET status = 'rejected', admin_note = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [note || null, id]
    );
    await client.query('COMMIT');
    await logAudit({
      action: 'campaign.reject',
      entityType: 'ad_campaign',
      entityId: id,
      details: { note },
    });
    return getCampaign(id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function pauseCampaign(id) {
  const { rows } = await pool.query(
    `UPDATE ad_campaigns SET status = 'paused', updated_at = NOW()
     WHERE id = $1 AND status = 'active' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new ValidationError('Campaign not active.');
  return rows[0];
}

async function resumeCampaign(id) {
  const { rows } = await pool.query(
    `UPDATE ad_campaigns SET status = 'active', updated_at = NOW()
     WHERE id = $1 AND status = 'paused' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new ValidationError('Campaign not paused.');
  return rows[0];
}

async function earningsStats(userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(reward),0) AS total_earned, COUNT(*)::int AS views
     FROM ad_views WHERE viewer_id = $1`,
    [userId]
  );
  return rows[0];
}

module.exports = {
  AD_TYPES,
  getSettings,
  createCampaign,
  getCampaign,
  listActiveForViewer,
  listUserCampaigns,
  listPendingCampaigns,
  listCampaigns,
  recordView,
  openClaimSession,
  viewsToday,
  leaderboard,
  approveCampaign,
  rejectCampaign,
  pauseCampaign,
  resumeCampaign,
  earningsStats,
};
