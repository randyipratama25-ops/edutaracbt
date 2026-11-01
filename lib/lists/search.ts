// Local lists use a literal, case-insensitive substring, matching the visible query.
export function matchesSearch(text: string, query: string) {
 return text.toLocaleLowerCase('id-ID').includes(query.trim().toLocaleLowerCase('id-ID'));
}
