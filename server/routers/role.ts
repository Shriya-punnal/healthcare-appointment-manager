import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../_core/trpc";

export const roleProcedure = (...roles: Array<"patient" | "doctor" | "admin">) => protectedProcedure.use(({ ctx, next }) => {
  if (!roles.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN: Your account does not have permission for this action." });
  }
  return next();
});
