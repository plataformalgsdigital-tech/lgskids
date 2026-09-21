import { videoLibroPrevioHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = videoLibroPrevioHandler;
