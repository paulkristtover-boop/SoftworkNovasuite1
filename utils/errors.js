class AppError extends Error {
  constructor(message, code = 'APP_ERROR', status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

class BannedError extends AppError {
  constructor(reason = 'Your account has been restricted.') {
    super(reason, 'BANNED', 403);
    this.name = 'BannedError';
  }
}

class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient balance.') {
    super(message, 'INSUFFICIENT_BALANCE', 400);
    this.name = 'InsufficientBalanceError';
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 'VALIDATION', 400);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

module.exports = {
  AppError,
  BannedError,
  InsufficientBalanceError,
  ValidationError,
  NotFoundError,
};
