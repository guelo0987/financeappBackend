-- Budget planning enhancements
-- 1) add ahorro_objetivo to presupuestos
-- 2) add normalized income sources table presupuesto_ingresos

BEGIN;

ALTER TABLE presupuestos
  ADD COLUMN IF NOT EXISTS ahorro_objetivo numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS presupuesto_ingresos (
  presupuesto_id bigint NOT NULL,
  categoria_id bigint NOT NULL,
  monto_planeado numeric NOT NULL CHECK (monto_planeado > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presupuesto_ingresos_pk PRIMARY KEY (presupuesto_id, categoria_id),
  CONSTRAINT presupuesto_ingresos_presupuesto_fk
    FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(presupuesto_id) ON DELETE CASCADE,
  CONSTRAINT presupuesto_ingresos_categoria_fk
    FOREIGN KEY (categoria_id) REFERENCES categorias(categoria_id)
);

CREATE INDEX IF NOT EXISTS presupuesto_ingresos_categoria_idx
  ON presupuesto_ingresos(categoria_id);

COMMIT;
