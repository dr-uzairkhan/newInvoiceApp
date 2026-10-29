"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { projectSchema, type ProjectInput } from "@/lib/validation/project";
import {
  createProjectAction,
  updateProjectAction,
} from "@/actions/project.actions";
import { PartyPickerWithCreateEscape } from "@/components/project/PartyPickerWithCreateEscape";
import { InvoiceNumberFormatHelp } from "@/components/project/InvoiceNumberFormatHelp";
import { CreatePaymentMethodDialog } from "@/components/payment-method/CreatePaymentMethodDialog";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INVOICE_PERIOD_LABELS } from "@/lib/invoicePeriod";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CircleHelp } from "lucide-react";
import type { Party, PaymentMethod } from "@/generated/prisma/client";

/** Sentinel for "no preferred payment method" — Select items can't carry an empty-string value. */
const NO_PAYMENT_METHOD = "__none__";

/** Sentinel for "no invoice period" — Select items can't carry an empty-string value. */
const NO_INVOICE_PERIOD = "__none__";

const displayCurrencyLabels: Record<ProjectInput["displayCurrency"], string> = {
  USD: "USD",
  AUD: "AUD",
  GBP: "GBP",
  NZD: "NZD",
  AED: "AED",
  PKR: "PKR",
  SAR: "SAR",
};

/** M26 — every currency choice, for `SINGLE` mode. */
const ALL_CURRENCIES = Object.keys(
  displayCurrencyLabels,
) as ProjectInput["displayCurrency"][];

/** M26 — USD excluded: it's always the implicit primary in `DUAL` mode, never the second display currency. */
const NON_USD_CURRENCIES = ALL_CURRENCIES.filter(
  (currency) => currency !== "USD",
);

const currencyModeLabels: Record<ProjectInput["currencyMode"], string> = {
  SINGLE: "Single Currency",
  DUAL: "Dual Currency",
};

const statusLabels: Record<ProjectInput["status"], string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export function ProjectForm({
  mode,
  projectId,
  defaultValues,
  initialParties,
  initialPaymentMethodsByPartyId,
}: {
  mode: "create" | "edit";
  projectId?: string;
  defaultValues?: Partial<ProjectInput>;
  initialParties: Party[];
  initialPaymentMethodsByPartyId: Record<string, PaymentMethod[]>;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parties, setParties] = useState(initialParties);
  const [paymentMethodsByPartyId, setPaymentMethodsByPartyId] = useState(
    initialPaymentMethodsByPartyId,
  );
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      abbreviation: "",
      serviceDescription: "",
      clientId: "",
      contractorId: "",
      preferredPaymentMethodId: "",
      invoiceNumberFormat: "{abbreviation}-{number}-{date}",
      previousInvoiceNumberFormats: "",
      ledger: "CLIENT",
      invoicePeriodType: "",
      currencyMode: "SINGLE",
      displayCurrency: "USD",
      referralCreditEnabled: false,
      referralCreditLabel: "",
      status: "ACTIVE",
      ...defaultValues,
    },
  });

  const contractorId = watch("contractorId");
  const availablePaymentMethods = paymentMethodsByPartyId[contractorId] ?? [];
  const abbreviation = watch("abbreviation");
  const invoiceNumberFormat = watch("invoiceNumberFormat");
  const currencyMode = watch("currencyMode");
  const referralCreditEnabled = watch("referralCreditEnabled");

  function registerNewParty(party: Party) {
    setParties((prev) =>
      [...prev, party].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setPaymentMethodsByPartyId((prev) => ({
      ...prev,
      [party.id]: prev[party.id] ?? [],
    }));
  }

  /** M17.4 — adds the new method to the pool and auto-selects it as Preferred, mirroring registerNewParty's auto-select-into-the-triggering-field behavior. */
  function registerNewPaymentMethod(paymentMethod: PaymentMethod) {
    setPaymentMethodsByPartyId((prev) => ({
      ...prev,
      [paymentMethod.partyId]: [
        ...(prev[paymentMethod.partyId] ?? []),
        paymentMethod,
      ],
    }));
    setValue("preferredPaymentMethodId", paymentMethod.id);
  }

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      const result =
        mode === "create"
          ? await createProjectAction(values)
          : await updateProjectAction(projectId!, values);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "create" ? "Project created" : "Project updated");
      router.push(`/projects/${result.data.id}`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} noValidate>
          <FormField
            label="Name"
            htmlFor="name"
            required
            error={errors.name?.message}
          >
            <Input id="name" {...register("name")} />
          </FormField>

          {mode === "create" ? (
            <FormField
              label="Ledger"
              htmlFor="ledger"
              required
              error={errors.ledger?.message}
            >
              <Controller
                name="ledger"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "CLIENT"}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger id="ledger" className="w-full">
                      <SelectValue
                        renderValue={(value) =>
                          value === "INTERNAL"
                            ? "Internal — on-demand invoices, kept off the main dashboard"
                            : "Client — tracked on the dashboard and in all counts"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLIENT">
                        Client — tracked on the dashboard and in all counts
                      </SelectItem>
                      <SelectItem value="INTERNAL">
                        Internal — on-demand invoices, kept off the main
                        dashboard
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Set once — a project never moves between ledgers.
              </p>
            </FormField>
          ) : null}

          <FormField
            label="Abbreviation"
            htmlFor="abbreviation"
            error={errors.abbreviation?.message}
          >
            <Input
              id="abbreviation"
              placeholder="Auto-derived from name if left blank"
              {...register("abbreviation")}
            />
          </FormField>

          <FormField
            label="Service Description"
            htmlFor="serviceDescription"
            error={errors.serviceDescription?.message}
          >
            <Input
              id="serviceDescription"
              placeholder="Shown in the invoice Details section. Leave blank to use the project name."
              {...register("serviceDescription")}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              name="contractorId"
              control={control}
              render={({ field }) => (
                <PartyPickerWithCreateEscape
                  label="Contractor"
                  parties={parties}
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    // A payment method scoped to the previous contractor is
                    // meaningless once the contractor changes.
                    setValue("preferredPaymentMethodId", "");
                  }}
                  onPartyCreated={registerNewParty}
                  error={errors.contractorId?.message}
                />
              )}
            />
            <Controller
              name="clientId"
              control={control}
              render={({ field }) => (
                <PartyPickerWithCreateEscape
                  label="Client"
                  parties={parties}
                  value={field.value}
                  onChange={field.onChange}
                  onPartyCreated={registerNewParty}
                  error={errors.clientId?.message}
                />
              )}
            />
          </div>

          <FormField
            label="Preferred Payment Method"
            htmlFor="preferredPaymentMethodId"
            error={errors.preferredPaymentMethodId?.message}
          >
            <Controller
              name="preferredPaymentMethodId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || NO_PAYMENT_METHOD}
                  onValueChange={(value) =>
                    field.onChange(value === NO_PAYMENT_METHOD ? "" : value)
                  }
                  disabled={!contractorId}
                >
                  <SelectTrigger
                    id="preferredPaymentMethodId"
                    className="w-full"
                  >
                    <SelectValue
                      placeholder={
                        contractorId ? "None" : "Select a contractor first"
                      }
                      renderValue={(value) =>
                        value === NO_PAYMENT_METHOD
                          ? "None"
                          : (() => {
                              const method = availablePaymentMethods.find(
                                (m) => m.id === value,
                              );
                              return method
                                ? `${method.label}${method.isDefault ? " (Default)" : ""}`
                                : undefined;
                            })()
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PAYMENT_METHOD}>None</SelectItem>
                    {availablePaymentMethods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        {method.label}
                        {method.isDefault ? " (Default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {contractorId && availablePaymentMethods.length === 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>This contractor has no payment methods yet.</span>
                <button
                  type="button"
                  className="font-semibold text-brand hover:underline"
                  onClick={() => setPaymentMethodDialogOpen(true)}
                >
                  + Create Payment Method
                </button>
              </div>
            ) : null}
          </FormField>

          {contractorId ? (
            <CreatePaymentMethodDialog
              open={paymentMethodDialogOpen}
              onOpenChange={setPaymentMethodDialogOpen}
              partyId={contractorId}
              onCreated={registerNewPaymentMethod}
            />
          ) : null}

          <FormField
            label="Invoice Number Format"
            htmlFor="invoiceNumberFormat"
            required
            error={errors.invoiceNumberFormat?.message}
            labelSuffix={
              <InvoiceNumberFormatHelp
                value={invoiceNumberFormat}
                abbreviation={abbreviation ?? ""}
                onInsertToken={(token) =>
                  setValue(
                    "invoiceNumberFormat",
                    `${getValues("invoiceNumberFormat")}${token}`,
                    { shouldValidate: true, shouldDirty: true },
                  )
                }
              />
            }
          >
            <Input
              id="invoiceNumberFormat"
              placeholder="{abbreviation}-{number}-{date}"
              {...register("invoiceNumberFormat")}
            />
          </FormField>

          <FormField
            label="Previous Invoice Number Formats"
            htmlFor="previousInvoiceNumberFormats"
            error={errors.previousInvoiceNumberFormats?.message}
          >
            <Textarea
              id="previousInvoiceNumberFormats"
              rows={2}
              className="font-mono"
              placeholder="One per line — formats this project used before"
              {...register("previousInvoiceNumberFormats")}
            />
            <p className="text-[11px] text-muted-foreground">
              Invoice numbers matching any of these are recognised as this
              project&rsquo;s history, so changing the format above never flags
              older invoices. The outgoing format is added here automatically
              when you change it.
            </p>
          </FormField>

          <FormField
            label="Invoice Period"
            htmlFor="invoicePeriodType"
            error={errors.invoicePeriodType?.message}
          >
            <Controller
              name="invoicePeriodType"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || NO_INVOICE_PERIOD}
                  onValueChange={(value) =>
                    field.onChange(value === NO_INVOICE_PERIOD ? "" : value)
                  }
                >
                  <SelectTrigger id="invoicePeriodType" className="w-full">
                    <SelectValue
                      renderValue={(value) =>
                        value === NO_INVOICE_PERIOD
                          ? "None"
                          : INVOICE_PERIOD_LABELS[
                              value as keyof typeof INVOICE_PERIOD_LABELS
                            ]
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INVOICE_PERIOD}>None</SelectItem>
                    {Object.entries(INVOICE_PERIOD_LABELS).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-[11px] text-muted-foreground">
              Used only to suggest a due date on the invoice create form — never
              enforced.
            </p>
          </FormField>

          <div className="mb-4">
            <div className="flex items-center gap-2">
              <Controller
                name="referralCreditEnabled"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="referralCreditEnabled"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                  />
                )}
              />
              <label
                htmlFor="referralCreditEnabled"
                className="text-[13px] font-medium text-foreground"
              >
                Referral Credit
              </label>
              <Popover>
                <PopoverTrigger
                  type="button"
                  aria-label="What does Referral Credit do?"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </PopoverTrigger>
                <PopoverContent className="w-64 text-[11px] text-muted-foreground">
                  Adds an &ldquo;Add Referral Credit&rdquo; button on this
                  project&rsquo;s invoices, for a one-off deduction from the
                  total (e.g. a referral commission owed to a third party).
                </PopoverContent>
              </Popover>
            </div>
            {referralCreditEnabled ? (
              <FormField
                label="Referral Credit Label"
                htmlFor="referralCreditLabel"
                error={errors.referralCreditLabel?.message}
                className="mt-2 mb-0"
              >
                <Input
                  id="referralCreditLabel"
                  placeholder='Defaults to "Referral Credit (Thank you!)"'
                  {...register("referralCreditLabel")}
                />
              </FormField>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Currency Mode"
              htmlFor="currencyMode"
              required
              error={errors.currencyMode?.message}
            >
              <Controller
                name="currencyMode"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      // USD is a valid Single Currency choice but can't be the
                      // Dual mode's second display currency — reset it so the
                      // hidden field never carries an invalid selection.
                      if (
                        value === "DUAL" &&
                        getValues("displayCurrency") === "USD"
                      ) {
                        setValue("displayCurrency", "AUD");
                      }
                    }}
                  >
                    <SelectTrigger id="currencyMode" className="w-full">
                      <SelectValue
                        renderValue={(value) =>
                          currencyModeLabels[
                            value as ProjectInput["currencyMode"]
                          ]
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SINGLE">Single Currency</SelectItem>
                      <SelectItem value="DUAL">Dual Currency</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              label={currencyMode === "DUAL" ? "Display Currency" : "Currency"}
              htmlFor="displayCurrency"
              required
              error={errors.displayCurrency?.message}
            >
              <Controller
                name="displayCurrency"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="displayCurrency" className="w-full">
                      <SelectValue
                        renderValue={(value) =>
                          displayCurrencyLabels[
                            value as ProjectInput["displayCurrency"]
                          ]
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(currencyMode === "DUAL"
                        ? NON_USD_CURRENCIES
                        : ALL_CURRENCIES
                      ).map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {displayCurrencyLabels[currency]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {currencyMode === "DUAL" ? (
                <p className="text-[11px] text-muted-foreground">
                  Only adds a converted total for display — the invoice&rsquo;s
                  core amounts stay in USD.
                </p>
              ) : null}
            </FormField>
          </div>

          <FormField
            label="Status"
            htmlFor="status"
            required
            error={errors.status?.message}
          >
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue
                      renderValue={(value) =>
                        statusLabels[value as ProjectInput["status"]]
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <Button type="submit" disabled={isSubmitting} className="mt-2">
            {isSubmitting
              ? "Saving…"
              : mode === "create"
                ? "Create Project"
                : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
