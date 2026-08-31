import { matricularHandler, rosterHandler } from "@/modules/enrollment";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const POST = matricularHandler;
export const GET = rosterHandler;
