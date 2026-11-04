-- Keep immutable snapshots and grading inputs unchanged; project only public question fields.
-- Existing attempts are protected at read time, and new snapshots omit distractor metadata.
do $patch$
declare definition text; before_text text := $old$student:=payload-array['key','rubric','rubricCriteria','explanation','keywords'];$old$;
begin
 select pg_get_functiondef('private.attempt_command_before_workflow(jsonb)'::regprocedure) into definition;
 if position(before_text in definition)=0 then raise exception 'Student projection anchor missing';end if;
 execute replace(definition,before_text,$new$student:=payload-array['key','rubric','rubricCriteria','explanation','keywords','distractors'];$new$);
 select pg_get_functiondef('private.attempt_dto(uuid)'::regprocedure) into definition;
 if position('q.student_payload' in definition)=0 then raise exception 'Student DTO anchor missing';end if;
 execute replace(definition,'q.student_payload',$new$(q.student_payload - array['key','rubric','rubricCriteria','explanation','keywords','distractors'])$new$);
end $patch$;
