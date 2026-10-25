-- 101: безопасное переименование анализа без изменения workflow-статуса.
CREATE OR REPLACE FUNCTION rename_analysis(
  p_analysis_id uuid,
  p_name text,
  p_prev_version integer,
  p_user_id uuid
) RETURNS execution_analyses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(p_name);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=p_user_id AND role='engineer') THEN
    RAISE EXCEPTION 'FORBIDDEN: Переименовывать анализ может только инженер'
      USING ERRCODE='42501';
  END IF;
  IF v_name = '' OR char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'INVALID: Название должно содержать от 1 до 200 символов'
      USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM execution_analyses
   WHERE id=p_analysis_id AND version=p_prev_version
   FOR UPDATE;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM execution_analyses WHERE id=p_analysis_id) THEN
      RAISE EXCEPTION 'Анализ % не найден', p_analysis_id USING ERRCODE='P0002';
    END IF;
    RAISE EXCEPTION 'CONFLICT: Анализ был изменён другим пользователем'
      USING ERRCODE='40001';
  END IF;

  WITH before_state AS (
    SELECT to_jsonb(ea.*) AS snap FROM execution_analyses ea WHERE ea.id=p_analysis_id
  ), updated AS (
    UPDATE execution_analyses
       SET name=v_name, version=version+1, updated_at=now()
     WHERE id=p_analysis_id
     RETURNING execution_analyses.*
  )
  INSERT INTO audit_log(entity_type, entity_id, action, before_state, after_state,
                        changed_by, batch_id, source_action)
  SELECT 'execution_analyses', p_analysis_id, 'update',
         (SELECT snap FROM before_state), to_jsonb(u.*),
         p_user_id, gen_random_uuid(), 'analysis_rename'
    FROM updated u;

  RETURN (SELECT ea FROM execution_analyses ea WHERE ea.id=p_analysis_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION rename_analysis(uuid,text,integer,uuid)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION rename_analysis(uuid,text,integer,uuid) TO service_role;
