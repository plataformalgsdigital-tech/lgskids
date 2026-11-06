import { bootstrapIdentity } from "@/modules/identity";
import { misHorasHandler } from "@/modules/intake";

bootstrapIdentity();

export const dynamic = "force-dynamic";

export const GET = misHorasHandler;
