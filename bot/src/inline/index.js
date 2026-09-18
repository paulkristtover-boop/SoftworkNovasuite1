/**
 * Inline query support (optional search for ads / users)
 */
function registerInline(bot) {
  bot.on('inline_query', async (ctx) => {
    // Minimal stub – can be expanded
    await ctx.answerInlineQuery([], { cache_time: 10 });
  });
}

module.exports = { registerInline };
