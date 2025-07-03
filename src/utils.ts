import { SubscribeUpdate, SubscribeUpdateTransaction } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";

/**'
 * Returns if the data is a SubscribeUpdate object with a transaction property
 */
export function isValidGrpcDataUpdate(data: SubscribeUpdate): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
  return (
    "transaction" in data &&
    typeof data.transaction === "object" &&
    data.transaction !== null &&
    "slot" in data.transaction &&
    "transaction" in data.transaction &&
    data.filters.includes("pumpFun")
  );
}
/**
 *
 * @param signature - The signature to convert.
 * @description Converts the signature from a Uint8Array to a base58 string.
 * @returns
 */
export function convertSignature(signature: Uint8Array): { base58: string } {
  return { base58: bs58.encode(Buffer.from(signature)) };
}
