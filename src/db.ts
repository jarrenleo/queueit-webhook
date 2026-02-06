import postgres from "postgres";

const sql = postgres(process.env.DATABASE_PUBLIC_URL as string);

export default sql;
