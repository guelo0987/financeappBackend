export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    codigo: string;
    mensaje: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
