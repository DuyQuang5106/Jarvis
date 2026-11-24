export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Không tìm thấy.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message = 'Dữ liệu không hợp lệ.') {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Dữ liệu đã thay đổi ở nơi khác.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class AiProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
  }
}

export class AiCapExceededError extends Error {
  constructor(message = 'Đã đạt giới hạn request AI trong ngày.') {
    super(message);
    this.name = 'AiCapExceededError';
  }
}
