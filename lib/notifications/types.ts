export type Notification = {id:string;title:string;priority:'info'|'important';message:string;created_at:string;read_at:string|null;has_exam:boolean;exam_id:string|null;exam_title:string|null};
export type InboxPage = {rows:Notification[];total:number;unread_total:number;page:number};
// Never navigate away or reload a running exam to handle a notification.
export function focusNotificationExam(examId:string) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examId))return false;
 const card=document.getElementById('exam-'+examId);
 if(!card||!card.getClientRects().length)return false;
 card.focus({preventScroll:true});card.scrollIntoView({block:'start',behavior:'auto'});return true;
}
