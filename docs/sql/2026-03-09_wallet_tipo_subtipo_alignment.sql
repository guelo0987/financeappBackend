-- Wallet alignment for new model
-- activos.nombre + activos.tipo (tipo_wallet)
-- subtipo removed

BEGIN;

-- 1) Ensure activos.tipo uses tipo_wallet enum
DO $$
DECLARE current_udt text;
BEGIN
  SELECT udt_name
  INTO current_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'activos'
    AND column_name = 'tipo';

  IF current_udt IS DISTINCT FROM 'tipo_wallet' THEN
    ALTER TABLE activos
      ALTER COLUMN tipo TYPE tipo_wallet
      USING (
        CASE tipo::text
          WHEN 'efectivo' THEN 'gastos'::tipo_wallet
          WHEN 'cuenta_bancaria' THEN 'cuentas'::tipo_wallet
          WHEN 'inversion' THEN 'cuentas'::tipo_wallet
          WHEN 'crypto' THEN 'cuentas'::tipo_wallet
          WHEN 'inmueble' THEN 'cuentas'::tipo_wallet
          WHEN 'vehiculo' THEN 'cuentas'::tipo_wallet
          WHEN 'otro' THEN 'cuentas'::tipo_wallet
          ELSE tipo::text::tipo_wallet
        END
      );
  END IF;
END $$;

-- 2) Remove old subtype checks/restrictions
ALTER TABLE activos DROP CONSTRAINT IF EXISTS activos_subtipo_check;

-- 3) Remove subtipo column from activos
ALTER TABLE activos DROP COLUMN IF EXISTS subtipo;

COMMIT;
