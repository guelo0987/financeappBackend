-- Link each transaction to a budget and ensure default budget per user

BEGIN;

-- 1) Ensure users have at least one default personal budget
INSERT INTO presupuestos (usuario_id, espacio_id, nombre, periodo, dia_inicio, ingresos, ahorro_objetivo, activo)
SELECT u.usuario_id, NULL, 'Predeterminado', 'mensual', 1, 0, 0, true
FROM usuarios u
LEFT JOIN presupuestos p
  ON p.usuario_id = u.usuario_id
WHERE p.presupuesto_id IS NULL;

-- 2) Add presupuesto_id to transacciones if missing
ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS presupuesto_id bigint;

-- 3) Backfill existing transactions with the active budget in same context
WITH candidates AS (
  SELECT
    t.transaccion_id,
    (
      SELECT p.presupuesto_id
      FROM presupuestos p
      WHERE p.usuario_id = t.usuario_id
        AND (
          (t.espacio_id IS NULL AND p.espacio_id IS NULL)
          OR (t.espacio_id IS NOT NULL AND p.espacio_id = t.espacio_id)
        )
      ORDER BY p.activo DESC, p.creado_en DESC, p.presupuesto_id DESC
      LIMIT 1
    ) AS matched_budget_id
  FROM transacciones t
  WHERE t.presupuesto_id IS NULL
)
UPDATE transacciones t
SET presupuesto_id = c.matched_budget_id
FROM candidates c
WHERE t.transaccion_id = c.transaccion_id
  AND c.matched_budget_id IS NOT NULL;

-- 4) Add FK + index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transacciones_presupuesto_fk'
  ) THEN
    ALTER TABLE transacciones
      ADD CONSTRAINT transacciones_presupuesto_fk
      FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(presupuesto_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transacciones_presupuesto_id_idx
  ON transacciones(presupuesto_id);

COMMIT;
