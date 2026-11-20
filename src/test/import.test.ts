import { describe, expect, it } from "vitest";
import { buildContacts, customKey, guessMapping } from "@/lib/import";

describe("CSV/Excel contact import", () => {
  it("guesses common column names and keeps the rest as custom fields", () => {
    expect(guessMapping(["Customer Name", "Mobile No", "Email ID", "City", "Loan Amount"])).toEqual({
      "Customer Name": "full_name", "Mobile No": "phone", "Email ID": "email", City: "city", "Loan Amount": "custom",
    });
    expect(guessMapping(["Phone", "Alt Phone"])).toEqual({ Phone: "phone", "Alt Phone": "custom" });
  });

  it("builds contacts, splits names, normalizes phones and reports bad rows", () => {
    const sheet = {
      fileType: "csv" as const,
      headers: ["Name", "Phone", "Loan Amount", "Tags"],
      rows: [
        ["Asha Rao", "98765 43210", "50000", "hot, emi"],
        ["Ravi", "12", "", ""],
        ["Dup", "+919876543210", "", ""],
        ["", "", "", ""],
        ["Meena K", "080196 28820", "", ""],
      ],
    };
    const { contacts, issues } = buildContacts(sheet, guessMapping(sheet.headers));
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({
      first_name: "Asha", last_name: "Rao", phone: "+919876543210", tags: ["hot", "emi"], custom_fields: { loan_amount: "50000" }, source: "Import",
    });
    expect(contacts[1]).toMatchObject({ first_name: "Meena", phone: "+918019628820" });
    expect(issues).toEqual([{ row: 3, reason: 'Invalid phone "12"' }, { row: 4, reason: "Duplicate phone +919876543210" }]);
  });

  it("makes safe JSON keys for custom columns", () => {
    expect(customKey("Loan Amount (₹)")).toBe("loan_amount");
    expect(customKey("  ")).toBe("field");
  });
});
