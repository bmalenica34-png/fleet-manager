export * from "./schemas/vehicle";
export * from "./schemas/client";
export * from "./schemas/contract";
export * from "./schemas/handoverPhoto";
export * from "./schemas/annex";
export * from "./schemas/photoRequest";
export * from "./schemas/signing";
export * from "./lib/dateFormat";
export * from "./data/vehicleCatalog";

export type {
  Vehicle,
  VehicleImage,
  Owner,
  Client,
  Contract,
  ContractStatus,
  HandoverPhoto,
  PhotoAngle,
  VehiclePart,
  Annex,
  AnnexStatus,
  PhotoRequest,
} from "@prisma/client";
