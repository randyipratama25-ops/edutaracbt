# ERD konseptual awal

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

Skema usulan, belum final; kunci organisasi, cardinality, retensi dan RLS harus dibuktikan dengan data nyata dan ADR.

```mermaid
erDiagram
  ORGANIZATION ||--o{ PROFILE : contains
  CLASS ||--o{ STUDENT_ENROLLMENT : contains
  PROFILE ||--o{ STUDENT_ENROLLMENT : has
  SUBJECT ||--o{ EXAM : has
  EXAM ||--o{ QUESTION_VERSION : includes
  EXAM ||--o{ ATTEMPT : has
  PROFILE ||--o{ ATTEMPT : takes
  ATTEMPT ||--o{ ANSWER : contains
  ATTEMPT ||--o{ GRADE_ITEM : produces
  EXAM ||--o{ ROOM : has
  ROOM ||--o{ ROOM_STUDENT : has
  ROOM ||--o{ SUPERVISOR_ASSIGNMENT : has
```
