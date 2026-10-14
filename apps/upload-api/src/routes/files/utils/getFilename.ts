import type fastifyPostgres from "@fastify/postgres";
import { fileServiceFromPool } from "../../../services/file-service.js";

const isFilenameAlreadyPresent = (
  pg: fastifyPostgres.PostgresDb,
  userId: string,
  filename: string,
) => fileServiceFromPool(pg.pool).isFilenameInUse(userId, filename);

const getFilename = async (
  pg: fastifyPostgres.PostgresDb,
  inputFilename: string,
  userId: string,
) => {
  const fileExists = await isFilenameAlreadyPresent(pg, userId, inputFilename);

  if (!fileExists) {
    return inputFilename;
  }

  let clashingFileExists = true;
  let newFilename = "";
  while (clashingFileExists) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const randomIndex = Array.from(array, (b) =>
      b.toString(36).padStart(2, "0"),
    ).join("");
    const ext = inputFilename.slice(inputFilename.lastIndexOf("."));
    const name = inputFilename.slice(0, inputFilename.lastIndexOf("."));
    newFilename = `${name}-${randomIndex}${ext}`;

    const fileExists = await isFilenameAlreadyPresent(pg, userId, newFilename);

    if (!fileExists) {
      clashingFileExists = false;
    }
  }

  return newFilename;
};

export default getFilename;
