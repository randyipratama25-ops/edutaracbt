-- Non-destructive disable: retain all grade history and export artefacts.
begin;
revoke execute on function public.results_command(jsonb),private.results_command(jsonb),public.report_command(jsonb),private.report_command(jsonb) from authenticated;
CREATE OR REPLACE FUNCTION private.attempt_finalize(target uuid, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.exam_attempts;q private.attempt_questions;val jsonb;earned numeric;sum_earned numeric:=0;sum_points numeric:=0;pending int:=0;begin
 select * into a from public.exam_attempts where id=target for update;
 if not found or a.finalized_at is not null then return;end if;
 if reason not in ('manual','timeout') then raise exception 'Mode finalisasi tidak valid';end if;
 if clock_timestamp()>=a.deadline_at then reason:='timeout';end if;
 if reason='timeout' and clock_timestamp()<a.deadline_at then raise exception 'Waktu ujian belum habis';end if;
 if a.status='disqualified' and reason='manual' then raise exception 'Attempt dikunci; hubungi pengawas';end if;
 if reason='manual' and exists(select 1 from private.attempt_questions sq left join public.attempt_answers sa on sa.attempt_id=sq.attempt_id and sa.question_id=sq.question_id where sq.attempt_id=target and coalesce((sq.grading_payload->>'required')::boolean,true) and not private.answer_complete(sq.grading_payload,sa.value)) then raise exception 'REQUIRED: Lengkapi semua jawaban wajib dan minimum karakter.';end if;
 for q in select * from private.attempt_questions where attempt_id=target order by position loop
 select value into val from public.attempt_answers where attempt_id=target and question_id=q.question_id;
 earned:=private.grade_one(q.grading_payload,val);sum_points:=sum_points+(q.grading_payload->>'points')::numeric;
 if earned is null then pending:=pending+1;else
 sum_earned:=sum_earned+earned;
 insert into public.grade_items(attempt_id,question_id,question_version,source,awarded_points,max_points) values(target,q.question_id,q.question_version,'auto',earned,(q.grading_payload->>'points')::numeric);end if;
 end loop;
 update public.exam_attempts set status=case when a.status='disqualified' then 'disqualified' when reason='timeout' then 'time_expired' else 'submitted' end,finalized_at=clock_timestamp(),grading_pending=pending,objective_earned=sum_earned,total_points=sum_points,score_percent=case when pending>0 then null when sum_points=0 then 0 else round(100*sum_earned/sum_points,2) end,version=version+1 where id=target;
 insert into public.audit_logs(organization_id,actor_id,action,target_type,target_id) values(a.organization_id,auth.uid(),'ATTEMPT_FINALIZED_'||reason,'exam_attempts',target::text);
end$function$
;
commit;
