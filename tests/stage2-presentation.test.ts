import { describe, expect, it } from "vitest";
import { completion, progressSummary } from "../lib/attempts/presentation";
describe("player progress distinguishes meaningful answers", () => {
  const pg={type:"PG",options:[{id:"A"},{id:"B"}]};
  const matching={type:"JODOH",options:[{id:"one"},{id:"two"}]};
  it("does not mark empty arrays or records as answered", () => {
    expect(completion(pg,[])).toBe("empty");expect(completion(matching,{})).toBe("empty");expect(completion(pg,["A"])).toBe("complete");
  });
  it("distinguishes partial statements from complete statements", () => {
    expect(completion(matching,{one:"A",two:""})).toBe("partial");expect(completion(matching,{one:"A",two:"B"})).toBe("complete");
  });
  it("respects meaningful essay minimum and canvas alternatives", () => {
    const essay={type:"Esai",options:[],minChars:4};
    expect(completion(essay,{text:"<b></b> $x$"})).toBe("empty");expect(completion(essay,{text:"abc"})).toBe("partial");expect(completion(essay,{text:"سلام"})).toBe("complete");
    expect(completion({...essay,minChars:0},{text:"",canvas_id:"canvas"})).toBe("complete");expect(completion(essay,{text:"",canvas_id:"canvas"})).toBe("partial");
  });
  it("summarizes optional blanks separately from incomplete mandatory answers", () => {
    const questions=[{id:"a",payload:pg},{id:"b",payload:{...matching,required:false}},{id:"c",payload:matching}];
    expect(progressSummary(questions,{a:["A"],c:{one:"A"}},["b","missing"]))
      .toEqual({complete:1,empty:1,partial:1,flagged:1,requiredMissing:1});
  });
});
