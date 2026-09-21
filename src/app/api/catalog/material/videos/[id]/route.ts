import { videoLibroEliminarHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const DELETE = videoLibroEliminarHandler;
