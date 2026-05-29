import type { MarkupFormat } from "./types";

export const PRESETS: Record<MarkupFormat, { valid: string; invalid: string }> = {
  json: {
    valid: JSON.stringify(
      {
        loan_id: "MAXEX-2026-001",
        loan_type: "conventional",
        occupancy_type: "primary_residence",
        loan_amount: 450000,
        ltv_ratio: 85,
        dti_ratio: 42,
        fico_score: 740,
        property_value: 529412,
        borrower_income: 120000,
        is_self_employed: false,
        units: 1,
        state: "CA",
      },
      null,
      2
    ),
    invalid: JSON.stringify(
      {
        loan_id: "MAXEX-2026-BAD",
        loan_type: "jumbo",
        occupancy_type: "investment_property",
        loan_amount: 1200000,
        ltv_ratio: 88,
        dti_ratio: 56,
        fico_score: 559,
        property_value: 1363636,
        borrower_income: 95000,
        is_self_employed: true,
        units: 1,
        state: "ZZ",
      },
      null,
      2
    ),
  },

  yaml: {
    valid: `loan_id: MAXEX-2026-001
loan_type: conventional
occupancy_type: primary_residence
loan_amount: 450000
ltv_ratio: 85
dti_ratio: 42
fico_score: 740
property_value: 529412
borrower_income: 120000
is_self_employed: false
units: 1
state: CA`,
    invalid: `loan_id: MAXEX-2026-BAD
loan_type: jumbo
occupancy_type: investment_property
loan_amount: 1200000
ltv_ratio: 88
dti_ratio: 56
fico_score: 559
property_value: 1363636
borrower_income: 95000
is_self_employed: true
units: 1
state: ZZ`,
  },

  xml: {
    valid: `<loan>
  <loan_id>MAXEX-2026-001</loan_id>
  <loan_type>conventional</loan_type>
  <occupancy_type>primary_residence</occupancy_type>
  <loan_amount>450000</loan_amount>
  <ltv_ratio>85</ltv_ratio>
  <dti_ratio>42</dti_ratio>
  <fico_score>740</fico_score>
  <property_value>529412</property_value>
  <borrower_income>120000</borrower_income>
  <is_self_employed>false</is_self_employed>
  <units>1</units>
  <state>CA</state>
</loan>`,
    invalid: `<loan>
  <loan_id>MAXEX-2026-BAD</loan_id>
  <loan_type>jumbo</loan_type>
  <occupancy_type>investment_property</occupancy_type>
  <loan_amount>1200000</loan_amount>
  <ltv_ratio>88</ltv_ratio>
  <dti_ratio>56</dti_ratio>
  <fico_score>559</fico_score>
  <property_value>1363636</property_value>
  <borrower_income>95000</borrower_income>
  <is_self_employed>true</is_self_employed>
  <units>1</units>
  <state>ZZ</state>
</loan>`,
  },

  toml: {
    valid: `loan_id = "MAXEX-2026-001"
loan_type = "conventional"
occupancy_type = "primary_residence"
loan_amount = 450000
ltv_ratio = 85
dti_ratio = 42
fico_score = 740
property_value = 529412
borrower_income = 120000
is_self_employed = false
units = 1
state = "CA"`,
    invalid: `loan_id = "MAXEX-2026-BAD"
loan_type = "jumbo"
occupancy_type = "investment_property"
loan_amount = 1200000
ltv_ratio = 88
dti_ratio = 56
fico_score = 559
property_value = 1363636
borrower_income = 95000
is_self_employed = true
units = 1
state = "ZZ"`,
  },
};
