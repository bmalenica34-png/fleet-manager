import type { Client } from "@prisma/client";
import { prisma } from "../db/client";
import type { ClientCreateInput, ClientUpdateInput } from "../schemas/client";

export async function listClients(): Promise<Client[]> {
  return prisma.client.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getClient(id: string): Promise<Client | null> {
  return prisma.client.findUnique({ where: { id } });
}

export async function createClient(input: ClientCreateInput): Promise<Client> {
  return prisma.client.create({ data: input });
}

export async function updateClient(
  id: string,
  input: ClientUpdateInput
): Promise<Client> {
  return prisma.client.update({ where: { id }, data: input });
}
