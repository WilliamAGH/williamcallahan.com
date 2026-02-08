import { jsonrepair } from "jsonrepair";

const partialJson = '{"summary": "This is a start of a summary", "highlights": ["One", "T';
try {
  const repaired = jsonrepair(partialJson);
  console.log("Repaired:", repaired);
} catch (e) {
  console.log("Repair failed:", e instanceof Error ? e.message : String(e));
}

const partialJson2 = '{"summary": "This is a start of a summary", "highlights": ["One", "Tw"]';
try {
  const repaired = jsonrepair(partialJson2);
  console.log("Repaired 2:", repaired);
} catch (e) {
  console.log("Repair 2 failed:", e instanceof Error ? e.message : String(e));
}
