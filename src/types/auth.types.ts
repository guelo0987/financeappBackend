export interface UpdateProfileDTO {
  nombre?: string;
  moneda_base?: 'DOP' | 'USD';
  meta_financiera?: string | null;
  meta_monto?: number | null;
  meta_fecha?: string | null;
}

export interface SupabaseSessionDTO {
  moneda_base?: 'DOP' | 'USD';
}

export interface AuthSessionResponse {
  usuario: UsuarioPublico;
  isNewUser: boolean;
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
