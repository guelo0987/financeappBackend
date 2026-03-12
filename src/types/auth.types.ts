export interface RegisterDTO {
  nombre: string;
  email: string;
  password: string;
  moneda_base?: 'DOP' | 'USD';
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface RefreshDTO {
  refreshToken: string;
}

export interface UpdateProfileDTO {
  nombre?: string;
  moneda_base?: 'DOP' | 'USD';
  meta_financiera?: string | null;
  meta_monto?: number | null;
  meta_fecha?: string | null;
}

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
}

export interface JwtPayload {
  sub: number;
  email: string;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  usuario: UsuarioPublico;
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
  presupuesto_default_id: number | null;
}

export interface SuscripcionResumen {
  estado: string;
  plan: string;
  trial_fin: Date;
  periodo_fin: Date | null;
}
