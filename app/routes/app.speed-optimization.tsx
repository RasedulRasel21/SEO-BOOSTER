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
  Tabs,
  Box,
  Divider,
  Banner,
  ChoiceList,
  TextField,
  Checkbox,
  Select,
  ProgressBar,
  Grid,
  Thumbnail,
  DataTable,
  EmptyState,
  Modal,
  TextContainer,
} from "@shopify/polaris";
import { RefreshIcon, ImageIcon } from "@shopify/polaris-icons";
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

  // Get speed settings
  let speedSettings = await prisma.speedOptimization.findFirst({
    where: { storeId: store.id },
  });

  if (!speedSettings) {
    speedSettings = await prisma.speedOptimization.create({
      data: {
        storeId: store.id,
        mobileScore: 0,
        desktopScore: 0,
        speedMode: "basic",
      },
    });
  }

  // Get image optimization stats
  const imageStats = await prisma.imageOptimization.groupBy({
    by: ["status"],
    where: { storeId: store.id },
    _count: true,
    _sum: {
      savedBytes: true,
    },
  });

  const totalImages = await prisma.imageOptimization.count({
    where: { storeId: store.id },
  });

  const optimizedImages = imageStats.find((s) => s.status === "optimized")?._count || 0;
  const totalSavedBytes = imageStats.find((s) => s.status === "optimized")?._sum?.savedBytes || 0;

  // Get recent image optimizations
  const recentOptimizations = await prisma.imageOptimization.findMany({
    where: { storeId: store.id, status: "optimized" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return json({
    shop,
    store,
    speedSettings,
    imageStats: {
      total: totalImages,
      optimized: optimizedImages,
      savedBytes: totalSavedBytes,
    },
    recentOptimizations,
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

  if (actionType === "updateSettings") {
    const speedMode = formData.get("speedMode") as string;
    const lazyLoadEnabled = formData.get("lazyLoadEnabled") === "true";
    const minificationEnabled = formData.get("minificationEnabled") === "true";
    const instantPageEnabled = formData.get("instantPageEnabled") === "true";
    const criticalCssEnabled = formData.get("criticalCssEnabled") === "true";

    await prisma.speedOptimization.updateMany({
      where: { storeId: store.id },
      data: {
        speedMode,
        lazyLoadEnabled,
        minificationEnabled,
        instantPageEnabled,
        criticalCssEnabled,
      },
    });

    return json({ success: true });
  }

  if (actionType === "optimizeImages") {
    // Fetch product images from Shopify
    const productsResponse = await admin.graphql(`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              images(first: 10) {
                edges {
                  node {
                    id
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    `);

    const productsData = await productsResponse.json();
    const products = productsData.data?.products?.edges || [];

    // Create image optimization records (in a real app, you'd process these images)
    for (const product of products) {
      for (const image of product.node.images?.edges || []) {
        const imageNode = image.node;
        await prisma.imageOptimization.upsert({
          where: {
            id: `${store.id}-${imageNode.id}`,
          },
          create: {
            id: `${store.id}-${imageNode.id}`,
            storeId: store.id,
            imageUrl: imageNode.url,
            originalSize: 100000, // Placeholder - would need actual size
            optimizedSize: 50000, // Placeholder
            savedBytes: 50000,
            savedPercent: 50,
            pageType: "product",
            resourceId: product.node.id,
            status: "optimized",
          },
          update: {},
        });
      }
    }

    return json({ success: true, optimized: products.length });
  }

  if (actionType === "recheck") {
    // Simulate PageSpeed check
    const mobileScore = Math.floor(Math.random() * 30) + 70;
    const desktopScore = Math.floor(Math.random() * 20) + 80;

    await prisma.speedOptimization.updateMany({
      where: { storeId: store.id },
      data: {
        mobileScore,
        desktopScore,
        loadingSpeed: Math.random() * 2 + 1,
        totalBlockingTime: Math.floor(Math.random() * 100),
        visualStability: Math.random() * 0.1,
        interactivity: Math.floor(Math.random() * 50 + 20),
      },
    });

    return json({ success: true, mobileScore, desktopScore });
  }

  return json({ success: false });
};

export default function SpeedOptimization() {
  const { shop, store, speedSettings, imageStats, recentOptimizations } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [selectedTab, setSelectedTab] = useState(0);
  const [speedMode, setSpeedMode] = useState(speedSettings?.speedMode || "basic");
  const [lazyLoadEnabled, setLazyLoadEnabled] = useState(speedSettings?.lazyLoadEnabled || false);
  const [minificationEnabled, setMinificationEnabled] = useState(speedSettings?.minificationEnabled || false);
  const [instantPageEnabled, setInstantPageEnabled] = useState(speedSettings?.instantPageEnabled || false);
  const [criticalCssEnabled, setCriticalCssEnabled] = useState(speedSettings?.criticalCssEnabled || false);
  const [showAmpModal, setShowAmpModal] = useState(false);

  const isLoading = navigation.state === "submitting";

  const handleSpeedModeChange = useCallback((value: string) => {
    setSpeedMode(value);
    if (value === "turbo") {
      setLazyLoadEnabled(true);
      setMinificationEnabled(true);
      setInstantPageEnabled(true);
    } else if (value === "rocket") {
      setLazyLoadEnabled(true);
      setMinificationEnabled(true);
      setInstantPageEnabled(true);
      setCriticalCssEnabled(true);
    }
  }, []);

  const handleSaveSettings = () => {
    submit(
      {
        action: "updateSettings",
        speedMode,
        lazyLoadEnabled: lazyLoadEnabled.toString(),
        minificationEnabled: minificationEnabled.toString(),
        instantPageEnabled: instantPageEnabled.toString(),
        criticalCssEnabled: criticalCssEnabled.toString(),
      },
      { method: "post" }
    );
  };

  const handleOptimizeImages = () => {
    submit({ action: "optimizeImages" }, { method: "post" });
  };

  const handleRecheck = () => {
    submit({ action: "recheck" }, { method: "post" });
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "#22c55e";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const tabs = [
    { id: "speed", content: "Site Speed Up", panelID: "speed-panel" },
    { id: "images", content: "Image Optimization", panelID: "images-panel" },
    { id: "amp", content: "AMP", panelID: "amp-panel" },
  ];

  const speedModes = [
    { label: "Basic", value: "basic", description: "Instant page & minify CSS" },
    { label: "Turbo", value: "turbo", description: "Basic + Lazy loading" },
    { label: "Rocket", value: "rocket", description: "Turbo + Critical CSS" },
    { label: "Custom", value: "custom", description: "Custom configuration" },
  ];

  return (
    <Page
      title="Speed Optimization"
      subtitle="Optimize your site performance with image compression, lazy loading, and critical CSS"
    >
      <Layout>
        <Layout.Section>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            {/* Site Speed Up Tab */}
            {selectedTab === 0 && (
              <Box paddingBlockStart="400">
                <Layout>
                  <Layout.Section variant="oneThird">
                    <Card>
                      <BlockStack gap="400">
                        <InlineStack align="space-between">
                          <Text as="h2" variant="headingMd">
                            PageSpeed Score
                          </Text>
                          <Button variant="plain" onClick={handleRecheck} loading={isLoading}>
                            Recheck
                          </Button>
                        </InlineStack>

                        <InlineStack gap="600" align="center">
                          <BlockStack align="center" gap="100">
                            <div
                              style={{
                                width: "80px",
                                height: "80px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "50%",
                                border: `5px solid ${getScoreColor(speedSettings?.mobileScore || 0)}`,
                              }}
                            >
                              <Text as="span" variant="headingLg" fontWeight="bold">
                                {speedSettings?.mobileScore || "--"}
                              </Text>
                            </div>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Mobile
                            </Text>
                          </BlockStack>

                          <BlockStack align="center" gap="100">
                            <div
                              style={{
                                width: "80px",
                                height: "80px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "50%",
                                border: `5px solid ${getScoreColor(speedSettings?.desktopScore || 0)}`,
                              }}
                            >
                              <Text as="span" variant="headingLg" fontWeight="bold">
                                {speedSettings?.desktopScore || "--"}
                              </Text>
                            </div>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Desktop
                            </Text>
                          </BlockStack>
                        </InlineStack>

                        <Divider />

                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">Loading speed</Text>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {speedSettings?.loadingSpeed?.toFixed(1) || "--"}s
                            </Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">Total Blocking Time</Text>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {speedSettings?.totalBlockingTime || "--"} ms
                            </Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">Visual stability</Text>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {speedSettings?.visualStability?.toFixed(3) || "--"}
                            </Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">Interactivity</Text>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {speedSettings?.interactivity || "--"} ms
                            </Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>

                  <Layout.Section>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Speed Up Mode
                        </Text>

                        <InlineStack gap="400" wrap={false}>
                          {speedModes.map((mode) => (
                            <Box
                              key={mode.value}
                              background={speedMode === mode.value ? "bg-surface-selected" : "bg-surface-secondary"}
                              padding="400"
                              borderRadius="200"
                              borderWidth="025"
                              borderColor={speedMode === mode.value ? "border-brand" : "border"}
                              minWidth="150px"
                            >
                              <BlockStack gap="200">
                                <InlineStack align="space-between">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {mode.label}
                                  </Text>
                                  <input
                                    type="radio"
                                    checked={speedMode === mode.value}
                                    onChange={() => handleSpeedModeChange(mode.value)}
                                  />
                                </InlineStack>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {mode.description}
                                </Text>
                              </BlockStack>
                            </Box>
                          ))}
                        </InlineStack>

                        <Divider />

                        {speedMode === "custom" && (
                          <BlockStack gap="300">
                            <Checkbox
                              label="Enable Lazy Loading"
                              helpText="Load images only when they enter the viewport"
                              checked={lazyLoadEnabled}
                              onChange={setLazyLoadEnabled}
                            />
                            <Checkbox
                              label="Enable Minification"
                              helpText="Minify CSS and JavaScript files"
                              checked={minificationEnabled}
                              onChange={setMinificationEnabled}
                            />
                            <Checkbox
                              label="Enable Instant Page"
                              helpText="Preload pages when users hover over links"
                              checked={instantPageEnabled}
                              onChange={setInstantPageEnabled}
                            />
                            <Checkbox
                              label="Enable Critical CSS"
                              helpText="Inline critical CSS for faster rendering"
                              checked={criticalCssEnabled}
                              onChange={setCriticalCssEnabled}
                            />
                          </BlockStack>
                        )}

                        <Button variant="primary" onClick={handleSaveSettings} loading={isLoading}>
                          Speed Up Now
                        </Button>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </Box>
            )}

            {/* Image Optimization Tab */}
            {selectedTab === 1 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="500">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Image Optimization Overview
                      </Text>

                      <InlineStack gap="400">
                        <Box background="bg-surface-secondary" padding="400" borderRadius="200" minWidth="200px">
                          <BlockStack gap="200">
                            <Text as="span" variant="headingLg" fontWeight="bold">
                              {imageStats.optimized}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Optimized Images
                            </Text>
                            <ProgressBar
                              progress={imageStats.total > 0 ? (imageStats.optimized / imageStats.total) * 100 : 0}
                              tone="success"
                            />
                          </BlockStack>
                        </Box>

                        <Box background="bg-surface-secondary" padding="400" borderRadius="200" minWidth="200px">
                          <BlockStack gap="200">
                            <Text as="span" variant="headingLg" fontWeight="bold">
                              {formatBytes(imageStats.savedBytes || 0)}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Total Saved Space
                            </Text>
                          </BlockStack>
                        </Box>

                        <Box background="bg-surface-secondary" padding="400" borderRadius="200" minWidth="200px">
                          <BlockStack gap="200">
                            <Text as="span" variant="headingLg" fontWeight="bold">
                              {imageStats.total > 0
                                ? Math.round((imageStats.savedBytes || 0) / (imageStats.total * 100000) * 100)
                                : 0}%
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Average Saved
                            </Text>
                          </BlockStack>
                        </Box>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text as="h2" variant="headingMd">
                          Auto Optimize Images
                        </Text>
                        <Badge tone="info">OFF</Badge>
                      </InlineStack>

                      <Text as="p" variant="bodySm" tone="subdued">
                        Automatically optimize all new and existing images according to your settings.
                      </Text>

                      <InlineStack gap="200">
                        <Button variant="primary" onClick={handleOptimizeImages} loading={isLoading}>
                          Optimize Now
                        </Button>
                        <Button>Revert All</Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  {recentOptimizations.length > 0 && (
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Optimization History
                        </Text>

                        <DataTable
                          columnContentTypes={["text", "text", "text", "text"]}
                          headings={["Image", "Original Size", "Optimized Size", "Saved"]}
                          rows={recentOptimizations.map((opt) => [
                            <Thumbnail source={opt.imageUrl} alt="Product image" size="small" />,
                            formatBytes(opt.originalSize),
                            formatBytes(opt.optimizedSize || 0),
                            `${opt.savedPercent?.toFixed(0) || 0}%`,
                          ])}
                        />
                      </BlockStack>
                    </Card>
                  )}
                </BlockStack>
              </Box>
            )}

            {/* AMP Tab */}
            {selectedTab === 2 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="500">
                  <Banner tone="warning">
                    <p>
                      Detection is incomplete because your site is currently password protected.
                      Change the settings and rescan.
                    </p>
                  </Banner>

                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text as="h2" variant="headingMd">
                            Activate Home Page AMP
                          </Text>
                          <Badge>Unpublished</Badge>
                        </BlockStack>
                        <Checkbox label="" checked={false} onChange={() => setShowAmpModal(true)} />
                      </InlineStack>

                      <Text as="p" variant="bodySm" tone="subdued">
                        If mobile website traffic is crucial to you, it's recommended to enable AMP.
                        This will help improve your site's loading speed on mobile devices and achieve higher rankings.
                      </Text>

                      <Button>Customize</Button>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Publish AMP for Other Pages
                      </Text>

                      <Text as="p" variant="bodySm" tone="subdued">
                        Deploy AMP pages to make them discoverable and indexable by Google.
                        Indexing typically starts within 1-7 days.
                      </Text>

                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodyMd">Products</Text>
                          <InlineStack gap="200">
                            <Badge>Off</Badge>
                            <Checkbox label="" checked={false} onChange={() => {}} />
                          </InlineStack>
                        </InlineStack>

                        <InlineStack align="space-between">
                          <Text as="span" variant="bodyMd">Collections</Text>
                          <InlineStack gap="200">
                            <Badge>Off</Badge>
                            <Checkbox label="" checked={false} onChange={() => {}} />
                          </InlineStack>
                        </InlineStack>

                        <InlineStack align="space-between">
                          <Text as="span" variant="bodyMd">Blogs</Text>
                          <InlineStack gap="200">
                            <Badge>Off</Badge>
                            <Checkbox label="" checked={false} onChange={() => {}} />
                          </InlineStack>
                        </InlineStack>

                        <InlineStack align="space-between">
                          <Text as="span" variant="bodyMd">Blog Posts</Text>
                          <InlineStack gap="200">
                            <Badge>Off</Badge>
                            <Checkbox label="" checked={false} onChange={() => {}} />
                          </InlineStack>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Box>
            )}
          </Tabs>
        </Layout.Section>
      </Layout>

      <Modal
        open={showAmpModal}
        onClose={() => setShowAmpModal(false)}
        title="Enable AMP"
        primaryAction={{
          content: "Enable",
          onAction: () => setShowAmpModal(false),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowAmpModal(false),
          },
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <p>
              Enabling AMP (Accelerated Mobile Pages) will create lightweight versions of your pages
              that load almost instantly on mobile devices. This can improve your mobile search rankings
              and user experience.
            </p>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
