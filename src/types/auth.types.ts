export interface RegistroDTO {
  nombre: string;
  email: string;
  password: string;
  moneda_base?: 'DOP' | 'USD';
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface JwtPayload {
  usuario_id: number;
  email: string;
}

export interface AuthResponse {
  usuario: UsuarioPublico;
  token: string;
}

export interface LoginResponse extends AuthResponse {
  suscripcion: SuscripcionResumen | null;
}

export interface UsuarioPublico {
  usuario_id: bigint;
  nombre: string;
  email: string;
  moneda_base: string;
  meta_financiera: string | null;
  meta_monto: any;
  meta_fecha: Date | null;
  creado_en: Date;
}

export interface SuscripcionResumen {
  estado: string;
  plan: string;
  trial_fin: Date;
  periodo_fin: Date | null;
}
