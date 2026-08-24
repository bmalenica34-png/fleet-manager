export * from "./schemas/vehicle";
export * from "./schemas/companySettings";
export * from "./schemas/employee";
export * from "./schemas/client";
export * from "./schemas/contract";
export * from "./schemas/handoverPhoto";
export * from "./schemas/annex";
export * from "./schemas/photoRequest";
export * from "./schemas/signing";
export * from "./schemas/ocr";
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
  CompanySettings,
  Employee,
  EmployeeStatus as EmployeeStatusModel,
} from "@prisma/client";
