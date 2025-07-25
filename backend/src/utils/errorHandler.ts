import { Request, Response, NextFunction } from 'express'
import { logger } from './logger'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message)
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.error({
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method
    })

    return res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode
    })
  }

  // 未知错误
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  })

  res.status(500).json({
    error: 'Internal server error',
    statusCode: 500
  })
}