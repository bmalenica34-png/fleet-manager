import { z } from "zod";

// Moduli su namjerno string literali (ne generiran Prisma enum tip) da ovaj
// paket ostane bezopasan za bundlati bilo gdje (uklj. mobile) - isti obrazac
// kao ContractStatus u schemas/contract.ts.
export const permissionModuleSchema = z.enum([
  "contracts",
  "vehicles",
  "clients",
  "invoicing",
  "settings",
]);
export type PermissionModule = z.infer<typeof permissionModuleSchema>;

export const PERMISSION_MODULES: PermissionModule[] = [
  "contracts",
  "vehicles",
  "clients",
  "invoicing",
  "settings",
];

export const employeeStatusSchema = z.enum(["active", "deactivated"]);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

export const employeeCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  permissions: z.array(permissionModuleSchema).default([]),
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  status: employeeStatusSchema.optional(),
  // Kad je poslano, ZAMJENJUJE cijeli set permisija (ne merge) - UI uvijek
  // šalje kompletan checkbox state, jednostavnije nego dijffati.
  permissions: z.array(permissionModuleSchema).optional(),
});
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
