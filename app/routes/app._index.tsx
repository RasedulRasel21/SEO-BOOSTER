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
  ProgressBar,
  Box,
  Divider,
  Banner,
  Icon,
  Grid,
  List,
  Link,
} from "@shopify/polaris";
import {
  RefreshIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { analyzeStoreSEO, saveAnalysisResult, getLatestScan } from "../services/seo-analyzer.server";

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

  // Get latest scan
  const latestScan = await getLatestScan(shop);

  // Get speed optimization settings
  const speedSettings = await prisma.speedOptimization.findFirst({
    where: { storeId: store.id },
  });

  // Get counts
  const blogPostsCount = await prisma.blogPost.count({
    where: { storeId: store.id },
  });

  const brokenLinksCount = await prisma.brokenLink.count({
    where: { storeId: store.id, isResolved: false },
  });

  const optimizedImagesCount = await prisma.imageOptimization.count({
    where: { storeId: store.id, status: "optimized" },
  });

  return json({
    shop,
    store,
    latestScan,
    speedSettings,
    blogPostsCount,
    brokenLinksCount,
    optimizedImagesCount,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "scan") {
    const result = await analyzeStoreSEO(admin, shop);
    await saveAnalysisResult(shop, result);
    return json({ success: true, result });
  }

  return json({ success: false });
};

export default function Index() {
  const {
    shop,
    store,
    latestScan,
    speedSettings,
    blogPostsCount,
    brokenLinksCount,
    optimizedImagesCount,
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();
  const navigation = useNavigation();
  const isScanning = navigation.state === "submitting";

  const seoScore = latestScan?.overallScore || 0;
  const lastScanDate = latestScan?.createdAt
    ? new Date(latestScan.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Never";

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#22c55e";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return { label: "Good", tone: "success" as const };
    if (score >= 50) return { label: "Medium", tone: "warning" as const };
    return { label: "Poor", tone: "critical" as const };
  };

  const scoreInfo = getScoreLabel(seoScore);

  const handleScan = () => {
    submit({ action: "scan" }, { method: "post" });
  };

  const issues = (latestScan?.issues as any[]) || [];
  const criticalIssues = issues.filter((i) => i.type === "critical");
  const warnings = issues.filter((i) => i.type === "warning");
  const goodResults = issues.filter((i) => i.type === "success");

  return (
    <Page title="SEO Booster - AI SEO and Blog Post">
      <BlockStack gap="500">
        {/* Welcome Banner */}
        <Banner
          title={`Welcome to SEO Booster, ${shop.split(".")[0]}!`}
          tone="info"
        >
          <p>
            Boost your store's visibility with AI-powered SEO tools. Start by
            running an SEO scan to identify areas for improvement.
          </p>
        </Banner>

        {/* Main Stats Grid */}
        <Grid>
          {/* SEO Score Card */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    SEO Score
                  </Text>
                  <Button
                    variant="plain"
                    icon={RefreshIcon}
                    onClick={handleScan}
                    loading={isScanning}
                  >
                    {isScanning ? "Scanning..." : "Rescan"}
                  </Button>
                </InlineStack>

                <InlineStack gap="400" blockAlign="center">
                  <div
                    style={{
                      width: "100px",
                      height: "100px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "50%",
                      border: `6px solid ${getScoreColor(seoScore)}`,
                      backgroundColor: "white",
                    }}
                  >
                    <Text as="span" variant="headingXl" fontWeight="bold">
                      {seoScore}
                    </Text>
                  </div>

                  <BlockStack gap="200">
                    <InlineStack gap="200">
                      <Text as="span" variant="bodyMd">
                        Your score is
                      </Text>
                      <Badge tone={scoreInfo.tone}>{scoreInfo.label}</Badge>
                    </InlineStack>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Last scan: {lastScanDate}
                    </Text>
                  </BlockStack>
                </InlineStack>

                {latestScan && (
                  <BlockStack gap="200">
                    <Divider />
                    <InlineStack gap="300">
                      <InlineStack gap="100">
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: "#ef4444",
                          }}
                        />
                        <Text as="span" variant="bodySm">
                          {latestScan.criticalIssues} Critical
                        </Text>
                      </InlineStack>
                      <InlineStack gap="100">
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: "#f59e0b",
                          }}
                        />
                        <Text as="span" variant="bodySm">
                          {latestScan.improvements} Improvements
                        </Text>
                      </InlineStack>
                      <InlineStack gap="100">
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: "#22c55e",
                          }}
                        />
                        <Text as="span" variant="bodySm">
                          {latestScan.goodResults} Good
                        </Text>
                      </InlineStack>
                    </InlineStack>
                  </BlockStack>
                )}

                <Button url="/app/seo-checker" fullWidth>
                  View Checklist
                </Button>
              </BlockStack>
            </Card>
          </Grid.Cell>

          {/* Speed Score Card */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Speed Score
                </Text>

                <InlineStack gap="600" blockAlign="center">
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
                        backgroundColor: "white",
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
                        backgroundColor: "white",
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

                <Button url="/app/speed-optimization" fullWidth>
                  Improve Speed
                </Button>
              </BlockStack>
            </Card>
          </Grid.Cell>

          {/* Quick Stats Card */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Quick Stats
                </Text>

                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      AI Blog Posts
                    </Text>
                    <Badge>{blogPostsCount}</Badge>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      Optimized Images
                    </Text>
                    <Badge tone="success">{optimizedImagesCount}</Badge>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      Broken Links
                    </Text>
                    <Badge tone={brokenLinksCount > 0 ? "critical" : "success"}>
                      {brokenLinksCount}
                    </Badge>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      AI Credits
                    </Text>
                    <Badge tone="info">{store.aiCredits}</Badge>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Get Started Section */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Get Started
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                Complete these steps to boost your SEO
              </Text>
            </InlineStack>

            <BlockStack gap="300">
              <InlineStack gap="300" blockAlign="start">
                <Icon
                  source={latestScan ? CheckCircleIcon : AlertCircleIcon}
                  tone={latestScan ? "success" : "subdued"}
                />
                <BlockStack gap="100">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Run SEO Scan
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Analyze your store for SEO issues and get recommendations
                  </Text>
                </BlockStack>
                {!latestScan && (
                  <Button size="slim" onClick={handleScan} loading={isScanning}>
                    Scan Now
                  </Button>
                )}
              </InlineStack>

              <Divider />

              <InlineStack gap="300" blockAlign="start">
                <Icon
                  source={optimizedImagesCount > 0 ? CheckCircleIcon : AlertCircleIcon}
                  tone={optimizedImagesCount > 0 ? "success" : "subdued"}
                />
                <BlockStack gap="100">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Optimize Images
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Compress images and add alt text for better SEO
                  </Text>
                </BlockStack>
                <Button size="slim" url="/app/search-appearance">
                  Optimize
                </Button>
              </InlineStack>

              <Divider />

              <InlineStack gap="300" blockAlign="start">
                <Icon
                  source={speedSettings?.lazyLoadEnabled ? CheckCircleIcon : AlertCircleIcon}
                  tone={speedSettings?.lazyLoadEnabled ? "success" : "subdued"}
                />
                <BlockStack gap="100">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Speed Up Store
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Enable lazy loading and other speed optimizations
                  </Text>
                </BlockStack>
                <Button size="slim" url="/app/speed-optimization">
                  Speed Up
                </Button>
              </InlineStack>

              <Divider />

              <InlineStack gap="300" blockAlign="start">
                <Icon
                  source={blogPostsCount > 0 ? CheckCircleIcon : AlertCircleIcon}
                  tone={blogPostsCount > 0 ? "success" : "subdued"}
                />
                <BlockStack gap="100">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Generate AI Blog Post
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Create SEO-optimized content with AI
                  </Text>
                </BlockStack>
                <Button size="slim" url="/app/content-optimization">
                  Create Post
                </Button>
              </InlineStack>
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Issues Preview */}
        {criticalIssues.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <InlineStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Critical Issues
                  </Text>
                  <Badge tone="critical">{criticalIssues.length}</Badge>
                </InlineStack>
                <Button variant="plain" url="/app/seo-checker">
                  View All
                </Button>
              </InlineStack>

              <List>
                {criticalIssues.slice(0, 3).map((issue: any) => (
                  <List.Item key={issue.id}>
                    <InlineStack gap="200">
                      <Text as="span" variant="bodyMd">
                        {issue.title}
                      </Text>
                      {issue.affectedPages && (
                        <Badge tone="critical">
                          {issue.affectedPages} pages
                        </Badge>
                      )}
                    </InlineStack>
                  </List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
