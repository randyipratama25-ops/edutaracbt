import { describe, it, expect } from "vitest";
import { questionSchema, studentQuestion } from "../lib/authoring/schema";
import { templates } from "../lib/authoring/imports";
import { bankCommand } from "../lib/bank/schema";
import { assessmentCommand } from "../lib/assessment/schema";
const id="00000000-0000-4000-8000-000000000001";
const criteria=[{id:"reason",label:"Penalaran",maxPoints:6},{id:"conclusion",label:"Kesimpulan",maxPoints:4}];
describe("bank and assessment boundaries",()=>{
 it("accepts weighted criteria and removes them from the student projection",()=>{
  const q=questionSchema.parse({...questionSchema.parse(templates.Esai),points:10,rubricCriteria:criteria});
  expect(studentQuestion(q)).not.toHaveProperty("rubricCriteria");
 });
 it.each([
  [{...criteria[0],maxPoints:5},criteria[1]],
  [criteria[0],{...criteria[1],id:"reason"}],
  [{...criteria[0],maxPoints:0},criteria[1]],
 ])("rejects invalid rubric weights or repeated identifiers",(rubricCriteria)=>{
  expect(questionSchema.safeParse({...questionSchema.parse(templates.Esai),points:10,rubricCriteria}).success).toBe(false);
 });
 it("rejects grading criteria on an objective question",()=>{
  expect(questionSchema.safeParse({...questionSchema.parse(templates.PG),points:10,rubricCriteria:criteria}).success).toBe(false);
 });
 it("enforces package target and question limits",()=>{
  const command={action:"assemble",request_id:id,exam_ids:[id],rules:[{type:"PG",count:100,points:2},{type:"Esai",count:100,points:10}]};
  expect(bankCommand.safeParse(command).success).toBe(true);
  expect(bankCommand.safeParse({...command,exam_ids:Array(4).fill(id)}).success).toBe(false);
  expect(bankCommand.safeParse({...command,rules:[...command.rules,{type:"PG",count:1,points:2}]}).success).toBe(false);
 });
 it("requires explicit scheduling confirmation and a valid timestamp",()=>{
  const command={action:"schedule",request_id:id,exam_id:id,scheduled_at:"2026-11-01T10:00:00+07:00",reason:"Publikasi terjadwal",confirmation:"JADWALKAN"};
  expect(assessmentCommand.safeParse(command).success).toBe(true);
  expect(assessmentCommand.safeParse({...command,confirmation:""}).success).toBe(false);
  expect(assessmentCommand.safeParse({...command,scheduled_at:"tomorrow"}).success).toBe(false);
 });
 it("accepts an explicit zero criterion while rejecting negative points",()=>{
  const command={action:"propose",request_id:id,attempt_id:id,question_id:id,expected_revision:1,points:0,criteria:{reason:0,conclusion:0},reason:"Jawaban belum memenuhi rubrik"};
  expect(assessmentCommand.safeParse(command).success).toBe(true);
  expect(assessmentCommand.safeParse({...command,criteria:{reason:-1}}).success).toBe(false);
 });
});
