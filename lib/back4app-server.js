import Parse from "parse/node";

if (!Parse.applicationId) {
  Parse.initialize(
    process.env.NEXT_PUBLIC_PARSE_APP_ID,
    process.env.NEXT_PUBLIC_PARSE_JS_KEY,
    process.env.PARSE_MASTER_KEY
  );
  Parse.serverURL = process.env.NEXT_PUBLIC_PARSE_SERVER_URL || "https://parseapi.back4app.com/";
}

export default Parse;