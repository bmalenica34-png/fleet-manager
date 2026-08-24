import type { Employee, EmployeePermission } from "@prisma/client";
import { prisma } from "../db/client";
import type {
  EmployeeCreateInput,
  EmployeeUpdateInput,
  PermissionModule,
} from "../schemas/employee";

export interface EmployeeDTO {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "active" | "deactivated";
  permissions: PermissionModule[];
  createdAt: Date;
}

function toDTO(employee: Employee & { permissions: EmployeePermission[] }): EmployeeDTO {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    status: employee.status,
    permissions: employee.permissions.map((p) => p.module),
    createdAt: employee.createdAt,
  };
}

export async function listEmployees(): Promise<EmployeeDTO[]> {
  const employees = await prisma.employee.findMany({
    include: { permissions: true },
    orderBy: { createdAt: "desc" },
  });
  return employees.map(toDTO);
}

export async function createEmployee(input: EmployeeCreateInput): Promise<EmployeeDTO> {
  const employee = await prisma.employee.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      permissions: {
        create: input.permissions.map((module) => ({ module })),
      },
    },
    include: { permissions: true },
  });
  return toDTO(employee);
}

/**
 * `permissions` u inputu, kad je poslan, ZAMJENJUJE cijeli set (delete-all +
 * create-all u transakciji) - jednostavnije i dovoljno brzo za realan broj
 * modula (5), nema potrebe diffati pojedinačne toggleve.
 */
export async function updateEmployee(
  id: string,
  input: EmployeeUpdateInput
): Promise<EmployeeDTO> {
  const { permissions, ...fields } = input;

  const employee = await prisma.$transaction(async (tx) => {
    if (permissions) {
      await tx.employeePermission.deleteMany({ where: { employeeId: id } });
      if (permissions.length > 0) {
        await tx.employeePermission.createMany({
          data: permissions.map((module) => ({ employeeId: id, module })),
        });
      }
    }
    return tx.employee.update({
      where: { id },
      data: fields,
      include: { permissions: true },
    });
  });

  return toDTO(employee);
}
