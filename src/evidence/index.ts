import raw from "./evidence.generated.json";
import { EvidenceSchema, type Evidence } from "./schema";

export const evidence: Evidence = EvidenceSchema.parse(raw);
