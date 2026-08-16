export * from "./schemas/vehicle";
export * from "./schemas/client";
export * from "./schemas/contract";
export * from "./schemas/handoverPhoto";
export * from "./schemas/annex";
export * from "./schemas/photoRequest";

export type {
  Vehicle,
  VehicleImage,
  Owner,
  Client,
  Contract,
  ContractStatus,
  HandoverPhoto,
  PhotoAngle,
  Annex,
  AnnexStatus,
  PhotoRequest,
} from "@prisma/client";
