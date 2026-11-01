import { z } from "zod";
export const newPasswordSchema = z
  .string()
  .min(12, "Gunakan minimal 12 karakter.")
  .max(128, "Password maksimal 128 karakter.");
export const activationTokensSchema = z.object({
  access_token: z.string().min(10).max(10000),
  refresh_token: z.string().min(10).max(10000),
});
