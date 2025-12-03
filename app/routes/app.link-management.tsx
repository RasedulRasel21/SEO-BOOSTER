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
  DataTable,
  EmptyState,
  Modal,
  Select,
  Pagination,
  Filters,
  ChoiceList,
} from "@shopify/polaris";
import { RefreshIcon, ImportIcon, ExportIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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

  // Get broken links
  const brokenLinks = await prisma.brokenLink.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
  });

  const unresolvedCount = brokenLinks.filter((l) => !l.isResolved).length;
  const resolvedCount = brokenLinks.filter((l) => l.isResolved).length;

  // Get last scan date
  const lastScan = brokenLinks[0]?.createdAt;

  return json({
    shop,
    store,
    brokenLinks,
    stats: {
      unresolved: unresolvedCount,
      resolved: resolvedCount,
      lastScan: lastScan ? new Date(lastScan).toLocaleDateString() : null,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  const store = await prisma.store.findUnique({
    where: { shop },
  });

  if (!store) {
    return json({ success: false, error: "Store not found" });
  }

  if (actionType === "scan") {
    // Scan for broken links
    // This would normally crawl the site and check all internal/external links
    // For demo purposes, we'll simulate finding some broken links

    // Clear old unresolved links
    await prisma.brokenLink.deleteMany({
      where: { storeId: store.id, isResolved: false },
    });

    // Fetch all products, collections, pages to check for broken links
    const productsResponse = await admin.graphql(`
      query {
        products(first: 50) {
          edges {
            node {
              id
              handle
              descriptionHtml
            }
          }
        }
      }
    `);
    const productsData = await productsResponse.json();
    const products = productsData.data?.products?.edges || [];

    // Simulate finding broken links (in production, you'd actually check URLs)
    // For now, we just return success
    return json({ success: true, found: 0 });
  }

  if (actionType === "resolve") {
    const linkId = formData.get("linkId") as string;
    const redirectUrl = formData.get("redirectUrl") as string;

    await prisma.brokenLink.update({
      where: { id: linkId },
      data: {
        redirectUrl,
        isResolved: true,
        resolvedAt: new Date(),
      },
    });

    return json({ success: true });
  }

  if (actionType === "addRedirect") {
    const sourceUrl = formData.get("sourceUrl") as string;
    const redirectUrl = formData.get("redirectUrl") as string;
    const redirectType = formData.get("redirectType") as string;

    // Create redirect in Shopify
    await admin.graphql(`
      mutation createUrlRedirect($urlRedirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $urlRedirect) {
          urlRedirect {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        urlRedirect: {
          path: sourceUrl,
          target: redirectUrl,
        },
      },
    });

    return json({ success: true });
  }

  if (actionType === "delete") {
    const linkId = formData.get("linkId") as string;

    await prisma.brokenLink.delete({
      where: { id: linkId },
    });

    return json({ success: true });
  }

  return json({ success: false });
};

export default function LinkManagement() {
  const { shop, store, brokenLinks, stats } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [showAddModal, setShowAddModal] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [redirectType, setRedirectType] = useState("301");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const isLoading = navigation.state === "submitting";

  const handleScan = () => {
    submit({ action: "scan" }, { method: "post" });
  };

  const handleResolve = (linkId: string, redirectUrl: string) => {
    submit({ action: "resolve", linkId, redirectUrl }, { method: "post" });
  };

  const handleAddRedirect = () => {
    submit(
      {
        action: "addRedirect",
        sourceUrl,
        redirectUrl,
        redirectType,
      },
      { method: "post" }
    );
    setShowAddModal(false);
    setSourceUrl("");
    setRedirectUrl("");
  };

  const handleDelete = (linkId: string) => {
    if (confirm("Are you sure you want to delete this broken link record?")) {
      submit({ action: "delete", linkId }, { method: "post" });
    }
  };

  const filteredLinks = brokenLinks.filter((link) => {
    const matchesSearch =
      searchQuery === "" ||
      link.sourceUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.brokenUrl.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter.length === 0 ||
      (statusFilter.includes("resolved") && link.isResolved) ||
      (statusFilter.includes("unresolved") && !link.isResolved);

    return matchesSearch && matchesStatus;
  });

  const redirectTypeOptions = [
    { label: "301 (Permanent)", value: "301" },
    { label: "302 (Temporary)", value: "302" },
  ];

  const handleStatusFilterChange = useCallback(
    (value: string[]) => setStatusFilter(value),
    []
  );

  const handleSearchChange = useCallback(
    (value: string) => setSearchQuery(value),
    []
  );

  const handleSearchClear = useCallback(() => setSearchQuery(""), []);

  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "Resolved", value: "resolved" },
            { label: "Unresolved", value: "unresolved" },
          ]}
          selected={statusFilter}
          onChange={handleStatusFilterChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  return (
    <Page
      title="Broken Link Manager"
      subtitle="404 redirects guide customers to the right information by redirecting them from non-existent pages"
      primaryAction={{
        content: "Scan for Broken Links",
        icon: RefreshIcon,
        onAction: handleScan,
        loading: isLoading,
      }}
      secondaryActions={[
        {
          content: "Add Custom Redirect",
          onAction: () => setShowAddModal(true),
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Enable Notifications Banner */}
            <Banner
              title="Enable email notifications"
              tone="info"
              action={{ content: "Notification settings", url: "/app/settings" }}
            >
              <p>
                Stay informed about website updates and ensure your visitors have a positive experience.
              </p>
            </Banner>

            {/* Stats Cards */}
            <InlineStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Unresolved 404 links
                  </Text>
                  <Text as="span" variant="headingXl" fontWeight="bold">
                    {stats.unresolved}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Resolved 404 links
                  </Text>
                  <Text as="span" variant="headingXl" fontWeight="bold">
                    {stats.resolved}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Last updated
                  </Text>
                  <Text as="span" variant="headingXl" fontWeight="bold">
                    {stats.lastScan || "--"}
                  </Text>
                </BlockStack>
              </Card>
            </InlineStack>

            {/* Automated Redirect Settings */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Automated Redirect
                  </Text>
                  <Button variant="plain">Edit</Button>
                </InlineStack>

                <Text as="p" variant="bodySm" tone="subdued">
                  Auto Resolve automatically detects and repairs broken links
                </Text>

                <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                  <BlockStack gap="300">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      Temporary redirect
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      All 404 will be redirected to the homepage instantly
                    </Text>
                  </BlockStack>
                </Box>

                <Divider />

                <BlockStack gap="300">
                  <InlineStack gap="200">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      Permanent Redirect (301)
                    </Text>
                    <Badge tone="info">Pro</Badge>
                  </InlineStack>
                  <Text as="span" variant="bodySm" tone="subdued">
                    All 404 links will be fixed permanently after a scheduled time
                  </Text>

                  <InlineStack gap="400">
                    <Box background="bg-surface-secondary" padding="300" borderRadius="100" minWidth="150px">
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          All 404 Product pages
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Redirect to ---
                        </Text>
                      </BlockStack>
                    </Box>

                    <Box background="bg-surface-secondary" padding="300" borderRadius="100" minWidth="150px">
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          All 404 Collection pages
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Redirect to ---
                        </Text>
                      </BlockStack>
                    </Box>

                    <Box background="bg-surface-secondary" padding="300" borderRadius="100" minWidth="150px">
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          All 404 Blog pages
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Redirect to ---
                        </Text>
                      </BlockStack>
                    </Box>

                    <Box background="bg-surface-secondary" padding="300" borderRadius="100" minWidth="150px">
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          Other 404 pages
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Redirect to ---
                        </Text>
                      </BlockStack>
                    </Box>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Custom Redirect List */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Custom Redirect
                  </Text>
                  <InlineStack gap="200">
                    <Button icon={ExportIcon} variant="plain">
                      Export
                    </Button>
                    <Button icon={ImportIcon} variant="plain">
                      Import
                    </Button>
                    <Button onClick={handleScan} loading={isLoading}>
                      Reload
                    </Button>
                  </InlineStack>
                </InlineStack>

                <Text as="p" variant="bodySm" tone="subdued">
                  Automatically detect broken links and create manual redirects.
                  <Badge tone="info">Pro plan</Badge>
                </Text>

                <Filters
                  queryValue={searchQuery}
                  queryPlaceholder="Search 404 pages by URL"
                  filters={filters}
                  onQueryChange={handleSearchChange}
                  onQueryClear={handleSearchClear}
                  onClearAll={() => {
                    setSearchQuery("");
                    setStatusFilter([]);
                  }}
                />

                {filteredLinks.length === 0 ? (
                  <EmptyState
                    heading="No items found"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Run a scan to detect broken links on your store.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "numeric", "text", "text"]}
                    headings={["Source URL", "Broken URL", "Status Code", "Status", "Actions"]}
                    rows={filteredLinks.map((link) => [
                      <Text as="span" variant="bodySm" truncate>
                        {link.sourceUrl}
                      </Text>,
                      <Text as="span" variant="bodySm" truncate>
                        {link.brokenUrl}
                      </Text>,
                      <Badge tone="critical">{link.statusCode}</Badge>,
                      link.isResolved ? (
                        <Badge tone="success">Resolved</Badge>
                      ) : (
                        <Badge tone="warning">Unresolved</Badge>
                      ),
                      <InlineStack gap="100">
                        {!link.isResolved && (
                          <Button
                            size="slim"
                            onClick={() => handleResolve(link.id, "/")}
                          >
                            Resolve
                          </Button>
                        )}
                        <Button
                          size="slim"
                          tone="critical"
                          onClick={() => handleDelete(link.id)}
                        >
                          Delete
                        </Button>
                      </InlineStack>,
                    ])}
                  />
                )}

                <InlineStack align="center">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Total count: {filteredLinks.length} link(s)
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Add Custom Redirect Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Custom Redirect"
        primaryAction={{
          content: "Add Redirect",
          onAction: handleAddRedirect,
          loading: isLoading,
          disabled: !sourceUrl || !redirectUrl,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowAddModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Source URL (404 page)"
              value={sourceUrl}
              onChange={setSourceUrl}
              placeholder="/old-page-url"
              helpText="The URL that returns a 404 error"
              autoComplete="off"
            />

            <TextField
              label="Redirect URL"
              value={redirectUrl}
              onChange={setRedirectUrl}
              placeholder="/new-page-url"
              helpText="The URL to redirect visitors to"
              autoComplete="off"
            />

            <Select
              label="Redirect Type"
              options={redirectTypeOptions}
              value={redirectType}
              onChange={setRedirectType}
              helpText="301 is permanent (recommended for SEO), 302 is temporary"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
