import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { createForm, listForms, getForm, renderEmbedSnippet } from "../core/forms.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}
function baseUrl(): string {
  return (process.env["DXCRM_SERVER_URL"] ?? "http://localhost:3847").replace(/\/+$/, "");
}

export const formCommand = new Command("form").description(
  "Inbound lead-capture web forms (POST /forms/:id)"
);

formCommand
  .command("add <id>")
  .description("Create a lead-capture form")
  .requiredOption("--name <name>", "Display name")
  .requiredOption(
    "--fields <json>",
    'Mapping JSON, e.g. {"work_email":"email","company":"company"}'
  )
  .option("--double-opt-in", "Require email confirmation (GDPR)")
  .option("--redirect <url>", "Redirect after successful submit")
  .action(
    (
      id: string,
      opts: { name: string; fields: string; doubleOptIn?: boolean; redirect?: string }
    ) => {
      try {
        const form = createForm(dataDir(), {
          id,
          name: opts.name,
          fields: JSON.parse(opts.fields) as Record<string, string>,
          ...(opts.doubleOptIn ? { doubleOptIn: true } : {}),
          ...(opts.redirect ? { redirectUrl: opts.redirect } : {}),
        });
        console.log(success(`✓ Form '${form.id}' created — POST ${baseUrl()}/forms/${form.id}`));
      } catch (err) {
        console.error(error((err as Error).message));
        process.exit(1);
      }
    }
  );

formCommand
  .command("list")
  .description("List lead-capture forms")
  .action(() => {
    const forms = listForms(dataDir());
    if (forms.length === 0) {
      console.log(info("No forms. Add one with 'dxcrm form add'."));
      return;
    }
    for (const f of forms) {
      const opts = [f.doubleOptIn ? "double-opt-in" : null].filter(Boolean).join(", ");
      console.log(
        `  ${bold(f.id)}  ${f.name}  fields: ${Object.keys(f.fields).join(", ")}${opts ? `  [${opts}]` : ""}`
      );
    }
  });

formCommand
  .command("snippet <id>")
  .description("Print the embeddable HTML snippet")
  .action((id: string) => {
    const form = getForm(dataDir(), id);
    if (!form) {
      console.error(error(`Form '${id}' not found`));
      process.exit(1);
    }
    console.log(renderEmbedSnippet(form, baseUrl()));
  });
