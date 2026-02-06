import postgres from "postgres";

const sql = postgres(process.env.PG_URL as string);

export default sql;
