import bcrypt from 'bcrypt';
import prisma from '../config/prisma';
import { generarToken } from '../utils/jwt';
import { BadRequestError, ConflictError, UnauthorizedError } from '../utils/errors';
import { RegistroDTO, LoginDTO, AuthResponse, LoginResponse } from '../types/auth.types';

const SALT_ROUNDS = 12;

export class AuthService {
  async registro(dto: RegistroDTO): Promise<AuthResponse> {
    this.validarRegistro(dto);

    const emailNormalizado = dto.email.toLowerCase().trim();

    const existente = await prisma.usuarios.findFirst({
      where: { email: emailNormalizado },
    });

    if (existente) {
      throw new ConflictError('EMAIL_EXISTENTE', 'Ya existe una cuenta con este email.');
    }

    const password_hash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const usuario = await prisma.usuarios.create({
      data: {
        nombre: dto.nombre.trim(),
        email: emailNormalizado,
        password_hash,
        moneda_base: dto.moneda_base || 'DOP',
        suscripciones: {
          create: {
            estado: 'prueba',
            plan: 'mensual',
          },
        },
      },
      select: {
        usuario_id: true,
        nombre: true,
        email: true,
        moneda_base: true,
        meta_financiera: true,
        meta_monto: true,
        meta_fecha: true,
        creado_en: true,
      },
    });

    const token = generarToken({
      usuario_id: Number(usuario.usuario_id),
      email: usuario.email,
    });

    return { usuario, token };
  }

  async login(dto: LoginDTO): Promise<LoginResponse> {
    if (!dto.email || !dto.password) {
      throw new BadRequestError('CAMPOS_REQUERIDOS', 'Los campos email y password son obligatorios.');
    }

    const emailNormalizado = dto.email.toLowerCase().trim();

    const usuario = await prisma.usuarios.findFirst({
      where: { email: emailNormalizado },
      include: {
        suscripciones: {
          select: {
            estado: true,
            plan: true,
            trial_fin: true,
            periodo_fin: true,
          },
        },
      },
    });

    if (!usuario) {
      throw new UnauthorizedError('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    const passwordValido = await bcrypt.compare(dto.password, usuario.password_hash);

    if (!passwordValido) {
      throw new UnauthorizedError('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    const token = generarToken({
      usuario_id: Number(usuario.usuario_id),
      email: usuario.email,
    });

    return {
      usuario: {
        usuario_id: usuario.usuario_id,
        nombre: usuario.nombre,
        email: usuario.email,
        moneda_base: usuario.moneda_base,
        meta_financiera: usuario.meta_financiera,
        meta_monto: usuario.meta_monto,
        meta_fecha: usuario.meta_fecha,
        creado_en: usuario.creado_en,
      },
      suscripcion: usuario.suscripciones,
      token,
    };
  }

  private validarRegistro(dto: RegistroDTO): void {
    if (!dto.nombre || !dto.email || !dto.password) {
      throw new BadRequestError('CAMPOS_REQUERIDOS', 'Los campos nombre, email y password son obligatorios.');
    }

    if (dto.password.length < 8) {
      throw new BadRequestError('PASSWORD_DEBIL', 'La contraseña debe tener al menos 8 caracteres.');
    }

    if (dto.moneda_base && !['DOP', 'USD'].includes(dto.moneda_base)) {
      throw new BadRequestError('MONEDA_INVALIDA', 'La moneda base debe ser DOP o USD.');
    }
  }
}
