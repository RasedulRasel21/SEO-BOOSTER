import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Box,
  Divider,
  Banner,
  TextField,
  Checkbox,
  FormLayout,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get or create store
  let store = await prisma.store.findUnique({
    where: { shop },
  });

  if (!store) {
    store = await prisma.store.create({
      data: { shop },
    });
  }

  return json({ shop, store });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  const store = await prisma.store.findUnique({
    where: { shop },
  });

  if (!store) {
    return json({ success: false, error: "Store not found" });
  }

  if (actionType === "updateStore") {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;

    await prisma.store.update({
      where: { id: store.id },
      data: { name, email },
    });

    return json({ success: true });
  }

  return json({ success: false });
};

export default function Settings() {
  const { shop, store } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [name, setName] = useState(store.name || shop.split(".")[0]);
  const [email, setEmail] = useState(store.email || "");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [autoOptimize, setAutoOptimize] = useState(false);

  const isLoading = navigation.state === "submitting";

  const handleSave = () => {
    submit({ action: "updateStore", name, email }, { method: "post" });
  };

  return (
    <Page title="Settings" subtitle="Configure your SEO Booster preferences">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Account Info */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Account Information
                </Text>

                <FormLayout>
                  <TextField
                    label="Store Name"
                    value={name}
                    onChange={setName}
                    autoComplete="organization"
                  />

                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    helpText="We'll use this email for notifications and reports"
                    autoComplete="email"
                  />
                </FormLayout>

                <Button variant="primary" onClick={handleSave} loading={isLoading}>
                  Save Changes
                </Button>
              </BlockStack>
            </Card>

            {/* Plan & Credits */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Plan & Credits
                  </Text>
                  <Button url="https://apps.shopify.com" external>
                    Upgrade
                  </Button>
                </InlineStack>

                <InlineStack gap="400">
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200" minWidth="150px">
                    <BlockStack gap="200">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Current Plan
                      </Text>
                      <Text as="span" variant="headingMd" fontWeight="bold">
                        {store.plan === "free" ? "Free" : "Pro"}
                      </Text>
                      <Badge tone={store.plan === "free" ? "info" : "success"}>
                        {store.plan === "free" ? "Basic Features" : "Full Access"}
                      </Badge>
                    </BlockStack>
                  </Box>

                  <Box background="bg-surface-secondary" padding="400" borderRadius="200" minWidth="150px">
                    <BlockStack gap="200">
                      <Text as="span" variant="bodySm" tone="subdued">
                        AI Credits
                      </Text>
                      <Text as="span" variant="headingMd" fontWeight="bold">
                        {store.aiCredits}
                      </Text>
                      <Badge tone={store.aiCredits > 50 ? "success" : store.aiCredits > 10 ? "warning" : "critical"}>
                        {store.aiCredits > 50 ? "Plenty" : store.aiCredits > 10 ? "Running Low" : "Almost Out"}
                      </Badge>
                    </BlockStack>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Notifications */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Notifications
                </Text>

                <Checkbox
                  label="Email notifications"
                  helpText="Receive email alerts about SEO issues, scan results, and optimization opportunities"
                  checked={emailNotifications}
                  onChange={setEmailNotifications}
                />

                <Checkbox
                  label="Weekly SEO report"
                  helpText="Get a weekly summary of your store's SEO performance"
                  checked={true}
                  onChange={() => {}}
                />
              </BlockStack>
            </Card>

            {/* Auto Optimization */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Auto Optimization
                </Text>

                <Checkbox
                  label="Auto-optimize new products"
                  helpText="Automatically generate meta tags and alt text for new products"
                  checked={autoOptimize}
                  onChange={setAutoOptimize}
                />

                <Checkbox
                  label="Auto-fix broken links"
                  helpText="Automatically redirect broken links to your homepage"
                  checked={false}
                  onChange={() => {}}
                />
              </BlockStack>
            </Card>

            {/* Danger Zone */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd" tone="critical">
                  Danger Zone
                </Text>

                <Banner tone="warning">
                  <p>These actions cannot be undone. Please proceed with caution.</p>
                </Banner>

                <InlineStack gap="200">
                  <Button tone="critical">Reset All Settings</Button>
                  <Button tone="critical">Clear All Data</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
