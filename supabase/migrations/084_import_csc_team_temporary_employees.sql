-- The CSC anniversary participants from teams_not_found.xlsx who have no
-- record anywhere in this database.
--
-- The spreadsheet is the leftovers of a name match against the plantilla, Job
-- Order and COS registries: every person here failed to match, which is why
-- they are entered as temporary personnel rather than linked to an existing
-- row. They exist for one reason - an event roster and a QR ID card.
--
-- Names arrive as "LAST, FIRST MIDDLE" and are split on that shape, with
-- JR./SR./II lifted out as a suffix wherever it appears. Two source rows read
-- "TAMPUS, ANGIE ZAMORA" (No. 121, same department) under both Group 7 and
-- Group 8; she is inserted once, under Group 7, because one person cannot be
-- on two teams. A one-line UPDATE moves her if Group 8 is the right one.
--
-- Idempotent: a name already present as a temporary is skipped, so running
-- this twice inserts nothing the second time.

SET search_path TO hris, public, auth, extensions;

WITH incoming (csc_team, last_name, first_name, middle_name, suffix) AS (
  VALUES
    ('Group 1 (WHITE)'::text, 'LABRADO'::text, 'RAFELLE'::text, 'RADA'::text, NULL::text),
    ('Group 1 (WHITE)', 'TECSON', 'BERNALD', 'M.', NULL),
    ('Group 1 (WHITE)', 'ABI-ABI', 'ELSIE', 'JUSTINIANE', NULL),
    ('Group 1 (WHITE)', 'CABILLO', 'ELBERT', 'ABING', NULL),
    ('Group 1 (WHITE)', 'DORIA', 'JOSEPH', 'DIADA', NULL),
    ('Group 1 (WHITE)', 'KAAMIÑO', 'GEORGE', 'MAGLANGIT', 'JR.'),
    ('Group 1 (WHITE)', 'MARTINEZ', 'MELVIN', 'ANG', NULL),
    ('Group 1 (WHITE)', 'SALAZAR', 'CARMENA', 'ATAY', NULL),
    ('Group 1 (WHITE)', 'UY', 'SYD MARVEN', 'MORALES', NULL),
    ('Group 1 (WHITE)', 'ABUCAY', 'ELL JUNE', 'SEBARIOS', NULL),
    ('Group 2 (PINK)', 'ABIABI', 'RICSIE', 'JUSTINIANE', NULL),
    ('Group 2 (PINK)', 'CANDANO', 'BELINDA', 'QUIJADO', NULL),
    ('Group 2 (PINK)', 'DORIA', 'MARIE JOY', 'LEONAR', NULL),
    ('Group 2 (PINK)', 'LACANG', 'ANTHONY', 'BURDEOS', NULL),
    ('Group 2 (PINK)', 'MATA', 'RENY', 'Q.', NULL),
    ('Group 2 (PINK)', 'PAQUERA', 'MIKHAIL FROILAN', 'B.', NULL),
    ('Group 2 (PINK)', 'SALDO', 'JUDEES MARIE', 'GULLEBAN', NULL),
    ('Group 2 (PINK)', 'BABAO', 'LEZEL', 'MARZON', NULL),
    ('Group 3 (YELLOW)', 'ALAMAG', 'JEAN', 'JADULOS', NULL),
    ('Group 3 (YELLOW)', 'CARREON', 'FERNANDO', 'R.', 'JR.'),
    ('Group 3 (YELLOW)', 'DUHAYLUNGSOD', 'ELPEDIA', 'D.', NULL),
    ('Group 3 (YELLOW)', 'LEONARDO', 'ALVIN', 'MOLINA', NULL),
    ('Group 3 (YELLOW)', 'MAYORDO', 'SEMHAM', 'LABRADOR', NULL),
    ('Group 3 (YELLOW)', 'PIOQUINTO', 'ZALDY', 'DAPITAN', NULL),
    ('Group 3 (YELLOW)', 'SALVAÑA', 'ALLAN', 'CARREON', NULL),
    ('Group 4 (GRAY)', 'ALBATERA', 'ANALIZA', 'PEKIT', NULL),
    ('Group 4 (GRAY)', 'CARREON', 'MERVIN', NULL, NULL),
    ('Group 4 (GRAY)', 'ELCARTE', 'DANNY', 'DAGO', NULL),
    ('Group 4 (GRAY)', 'LIGAN', 'JUSTINE', 'ABALLE', NULL),
    ('Group 4 (GRAY)', 'MURALLON', 'JIRDBEL', 'MACARAYO', NULL),
    ('Group 4 (GRAY)', 'PROPONGO', 'GRACEL MAE', 'BICOY', NULL),
    ('Group 4 (GRAY)', 'SAQUIN', 'MECHILLE', 'MUÑASQUE', NULL),
    ('Group 4 (GRAY)', 'TAGACTAC', 'KELLA', 'GRACE', NULL),
    ('Group 5 (BLUE)', 'TAPAYAN', 'ALEX', 'GALLO', NULL),
    ('Group 5 (BLUE)', 'ALEGRADO', 'ANGELO LEO', 'CAGOCO', NULL),
    ('Group 5 (BLUE)', 'CEBALLOS', 'STANLY', 'LEONES', NULL),
    ('Group 5 (BLUE)', 'ENGRACIA', 'RANDY', 'MAGLANGIT', NULL),
    ('Group 5 (BLUE)', 'LUYUN', 'DANNON YVES', 'ABERGAS', NULL),
    ('Group 5 (BLUE)', 'NARVASA', 'EMILIE', 'PERALES', NULL),
    ('Group 5 (BLUE)', 'RELUYA', 'MARK CLINTON', 'LANTACA', NULL),
    ('Group 5 (BLUE)', 'SUIZO', 'RAY', 'BAGUIO', NULL),
    ('Group 5 (BLUE)', 'INTO', 'ARCHIEANN', NULL, NULL),
    ('Group 6 (RED)', 'BALAT', 'JACK JESSON', 'DANAOTO', NULL),
    ('Group 6 (RED)', 'DE LEON', 'ESTANISLAWA', 'TAPAYAN', NULL),
    ('Group 6 (RED)', 'ETOQUILLA', 'JUN CAVEEN', 'CARREON', NULL),
    ('Group 6 (RED)', 'LUZANA', 'JE COURT', 'FLORES', NULL),
    ('Group 6 (RED)', 'ROA', 'RAY', 'JUMAWAN', NULL),
    ('Group 6 (RED)', 'SUIZO', 'ROLDIE ANN', 'BAGUIO', NULL),
    ('Group 7 (PURPLE)', 'BALBERONA', 'RENY', 'ORTIZ', NULL),
    ('Group 7 (PURPLE)', 'DOME', 'DOMINIC', 'LENDIO', NULL),
    ('Group 7 (PURPLE)', 'FUENTES', 'JOEL', 'MACAS', NULL),
    ('Group 7 (PURPLE)', 'MAJORENOS', 'JOSE REYLAN', 'P.', 'SR.'),
    ('Group 7 (PURPLE)', 'OGUE', 'MARC ANGELO', 'D.', NULL),
    ('Group 7 (PURPLE)', 'ROMERO', 'NIÑO URIEL MARCELO', 'C.', NULL),
    ('Group 7 (PURPLE)', 'TAMPUS', 'ANGIE', 'ZAMORA', NULL),
    ('Group 8 (ORANGE)', 'BANTILAN', 'LOIGEN', 'GUARDAQUIVIL', NULL),
    ('Group 8 (ORANGE)', 'GARCINES', 'PRINCESS ROSE', 'DOLINO', NULL),
    ('Group 8 (ORANGE)', 'JIMENO', 'JESSREL', 'AMISTAD', NULL),
    ('Group 8 (ORANGE)', 'MANZANO', 'BONIFACIO', 'BANASCO', 'II'),
    ('Group 8 (ORANGE)', 'OMILDA', 'MARY GRACE', 'T.', NULL),
    ('Group 8 (ORANGE)', 'PALANAS', 'CESAR', 'ALDUHIZA', NULL)
),
-- Skip anyone already entered, so a second run is a no-op.
fresh AS (
  SELECT i.*,
         row_number() OVER (ORDER BY i.csc_team, i.last_name, i.first_name) AS seq
  FROM incoming i
  WHERE NOT EXISTS (
    SELECT 1
    FROM hris.employees e
    WHERE e.employment_type = 'temporary'
      AND upper(e.last_name) = upper(i.last_name)
      AND upper(e.first_name) = upper(i.first_name)
      AND coalesce(upper(e.middle_name), '') = coalesce(upper(i.middle_name), '')
  )
),
-- employee_no is NOT NULL with no default and no sequence behind it.
-- Numbering up from the highest number already in use keeps these clear of
-- every existing row, whatever format those rows are in.
--
-- The ::text cast is not decoration: employee_no is INTEGER in production and
-- TEXT in the migration that created it (001), so regexp_replace has to be
-- handed a string either way. For the same reason the number below is written
-- as a bigint and NOT cast to text -- Postgres will assign a bigint to either
-- column type, but never a text value to an integer column.
base AS (
  SELECT coalesce(
           max(nullif(regexp_replace(employee_no::text, '[^0-9]', '', 'g'), '')::bigint),
           0
         ) AS high
  FROM hris.employees
)
INSERT INTO hris.employees (
  employee_no,
  first_name,
  middle_name,
  last_name,
  suffix,
  employment_type,
  csc_team,
  salary_grade,
  step_increment,
  hire_date,
  status
)
SELECT
  b.high + f.seq,
  f.first_name,
  f.middle_name,
  f.last_name,
  f.suffix,
  'temporary',
  f.csc_team,
  -- salary_grade and hire_date are NOT NULL on the table and meaningless for
  -- a temporary. Grade 1 and today are placeholders; nothing computes pay,
  -- DTR or step increments for this employment type.
  1,
  1,
  CURRENT_DATE,
  'active'
FROM fresh f
CROSS JOIN base b;
