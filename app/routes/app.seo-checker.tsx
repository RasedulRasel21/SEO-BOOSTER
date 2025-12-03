import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
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
  Icon,
  Collapsible,
  List,
  Spinner,
  EmptyState,
} from "@shopify/polaris";
import {
  RefreshIcon,
  AlertTriangleIcon,
  InfoIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { analyzeStoreSEO, saveAnalysisResult, getLatestScan } from "../services/seo-analyzer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const latestScan = await getLatestScan(shop);

  return json({ shop, latestScan });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "scan") {
    const result = await analyzeStoreSEO(admin, shop);
    await saveAnalysisResult(shop, result);
    return json({ success: true, result });
  }

  if (actionType === "one-click-fix") {
    // Placeholder for one-click fix functionality
    return json({ success: true, message: "Fix applied" });
  }

  return json({ success: false });
};

export default function SEOChecker() {
  const { shop, latestScan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [selectedTab, setSelectedTab] = useState(0);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  const isScanning = navigation.state === "submitting";

  const handleScan = () => {
    submit({ action: "scan" }, { method: "post" });
  };

  const handleOneClickFix = () => {
    submit({ action: "one-click-fix" }, { method: "post" });
  };

  const toggleIssue = useCallback((id: string) => {
    setExpandedIssues((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const issues = (latestScan?.issues as any[]) || [];
  const criticalIssues = issues.filter((i) => i.type === "critical");
  const warnings = issues.filter((i) => i.type === "warning");
  const goodResults = issues.filter((i) => i.type === "success");

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

  const tabs = [
    {
      id: "critical",
      content: (
        <InlineStack gap="200">
          <span>Critical Issues</span>
          <Badge tone="critical">{criticalIssues.length}</Badge>
        </InlineStack>
      ),
      panelID: "critical-panel",
    },
    {
      id: "improvements",
      content: (
        <InlineStack gap="200">
          <span>Improvements</span>
          <Badge tone="warning">{warnings.length}</Badge>
        </InlineStack>
      ),
      panelID: "improvements-panel",
    },
    {
      id: "good",
      content: (
        <InlineStack gap="200">
          <span>Good Results</span>
          <Badge tone="success">{goodResults.length}</Badge>
        </InlineStack>
      ),
      panelID: "good-panel",
    },
  ];

  const renderIssue = (issue: any) => (
    <Box key={issue.id} paddingBlockStart="300" paddingBlockEnd="300">
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <Icon
              source={
                issue.type === "critical"
                  ? AlertTriangleIcon
                  : issue.type === "warning"
                  ? InfoIcon
                  : CheckCircleIcon
              }
              tone={
                issue.type === "critical"
                  ? "critical"
                  : issue.type === "warning"
                  ? "caution"
                  : "success"
              }
            />
            <BlockStack gap="100">
              <Text as="span" variant="bodyMd" fontWeight="semibold">
                {issue.title}
              </Text>
              {issue.affectedPages !== undefined && (
                <Text as="span" variant="bodySm" tone="subdued">
                  {issue.affectedPages} pages affected
                </Text>
              )}
            </BlockStack>
          </InlineStack>

          <InlineStack gap="200">
            {issue.fixable && (
              <Button
                size="slim"
                url={`/app/search-appearance?fix=${issue.resourceType}`}
              >
                Fix
              </Button>
            )}
            <Button
              variant="plain"
              icon={
                expandedIssues.has(issue.id) ? ChevronUpIcon : ChevronDownIcon
              }
              onClick={() => toggleIssue(issue.id)}
              accessibilityLabel="Toggle details"
            />
          </InlineStack>
        </InlineStack>

        <Collapsible
          open={expandedIssues.has(issue.id)}
          id={`issue-${issue.id}`}
          transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
        >
          <Box paddingBlockStart="200" paddingInlineStart="800">
            <Text as="p" variant="bodySm" tone="subdued">
              {issue.description}
            </Text>
          </Box>
        </Collapsible>
      </BlockStack>
      <Box paddingBlockStart="300">
        <Divider />
      </Box>
    </Box>
  );

  const getTabContent = () => {
    switch (selectedTab) {
      case 0:
        return criticalIssues.length > 0 ? (
          criticalIssues.map(renderIssue)
        ) : (
          <Box padding="400">
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              No critical issues found!
            </Text>
          </Box>
        );
      case 1:
        return warnings.length > 0 ? (
          warnings.map(renderIssue)
        ) : (
          <Box padding="400">
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              No improvements needed!
            </Text>
          </Box>
        );
      case 2:
        return goodResults.length > 0 ? (
          goodResults.map(renderIssue)
        ) : (
          <Box padding="400">
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              Run a scan to see good results
            </Text>
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Page
      title="SEO Checker"
      subtitle="Conduct real-time, comprehensive checks on factors affecting your website's SEO"
      primaryAction={{
        content: isScanning ? "Scanning..." : "Rescan",
        icon: RefreshIcon,
        onAction: handleScan,
        loading: isScanning,
      }}
      secondaryActions={
        criticalIssues.length > 0
          ? [
              {
                content: "One-click Fix",
                onAction: handleOneClickFix,
              },
            ]
          : []
      }
    >
      <Layout>
        <Layout.Section>
          {!latestScan ? (
            <Card>
              <EmptyState
                heading="Run your first SEO scan"
                action={{
                  content: "Scan Now",
                  onAction: handleScan,
                  loading: isScanning,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Analyze your store for SEO issues and get actionable
                  recommendations to improve your search rankings.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="500">
              {/* Score Overview */}
              <Layout>
                <Layout.Section variant="oneThird">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Overall Score
                      </Text>

                      <InlineStack gap="400" blockAlign="center">
                        <div
                          style={{
                            width: "120px",
                            height: "120px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "50%",
                            border: `8px solid ${getScoreColor(seoScore)}`,
                            backgroundColor: "white",
                          }}
                        >
                          <Text as="span" variant="heading2xl" fontWeight="bold">
                            {seoScore}
                          </Text>
                        </div>
                      </InlineStack>

                      <InlineStack gap="200" align="center">
                        <Text as="span" variant="bodyMd">
                          Your score is
                        </Text>
                        <Badge tone={scoreInfo.tone}>{scoreInfo.label}</Badge>
                      </InlineStack>

                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        Last scan: {lastScanDate}
                      </Text>

                      <Divider />

                      <BlockStack gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Task to solve: {criticalIssues.length + warnings.length}
                        </Text>
                        <InlineStack gap="200">
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
                              {criticalIssues.length} critical
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
                              {goodResults.length} good
                            </Text>
                          </InlineStack>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </Layout.Section>

                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <Tabs
                        tabs={tabs}
                        selected={selectedTab}
                        onSelect={setSelectedTab}
                      />

                      <Box>{getTabContent()}</Box>
                    </BlockStack>
                  </Card>
                </Layout.Section>
              </Layout>

              {/* Detailed Scores */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Detailed Report
                  </Text>

                  <InlineStack gap="400">
                    <Box
                      background="bg-surface-secondary"
                      padding="400"
                      borderRadius="200"
                      minWidth="150px"
                    >
                      <BlockStack gap="200" align="center">
                        <Text as="span" variant="headingLg" fontWeight="bold">
                          {latestScan.contentScore}
                        </Text>
                        <Text as="span" variant="bodySm">
                          Content
                        </Text>
                        <Badge
                          tone={
                            latestScan.contentScore >= 80
                              ? "success"
                              : latestScan.contentScore >= 50
                              ? "warning"
                              : "critical"
                          }
                        >
                          {latestScan.contentScore >= 80
                            ? "Good"
                            : latestScan.contentScore >= 50
                            ? "Medium"
                            : "Poor"}
                        </Badge>
                      </BlockStack>
                    </Box>

                    <Box
                      background="bg-surface-secondary"
                      padding="400"
                      borderRadius="200"
                      minWidth="150px"
                    >
                      <BlockStack gap="200" align="center">
                        <Text as="span" variant="headingLg" fontWeight="bold">
                          {latestScan.accessibilityScore}
                        </Text>
                        <Text as="span" variant="bodySm">
                          Accessibility
                        </Text>
                        <Badge
                          tone={
                            latestScan.accessibilityScore >= 80
                              ? "success"
                              : latestScan.accessibilityScore >= 50
                              ? "warning"
                              : "critical"
                          }
                        >
                          {latestScan.accessibilityScore >= 80
                            ? "Good"
                            : latestScan.accessibilityScore >= 50
                            ? "Medium"
                            : "Poor"}
                        </Badge>
                      </BlockStack>
                    </Box>

                    <Box
                      background="bg-surface-secondary"
                      padding="400"
                      borderRadius="200"
                      minWidth="150px"
                    >
                      <BlockStack gap="200" align="center">
                        <Text as="span" variant="headingLg" fontWeight="bold">
                          {latestScan.performanceScore}
                        </Text>
                        <Text as="span" variant="bodySm">
                          Performance
                        </Text>
                        <Badge
                          tone={
                            latestScan.performanceScore >= 80
                              ? "success"
                              : latestScan.performanceScore >= 50
                              ? "warning"
                              : "critical"
                          }
                        >
                          {latestScan.performanceScore >= 80
                            ? "Good"
                            : latestScan.performanceScore >= 50
                            ? "Medium"
                            : "Poor"}
                        </Badge>
                      </BlockStack>
                    </Box>

                    <Box
                      background="bg-surface-secondary"
                      padding="400"
                      borderRadius="200"
                      minWidth="150px"
                    >
                      <BlockStack gap="200" align="center">
                        <Text as="span" variant="headingLg" fontWeight="bold">
                          {latestScan.crawledPages}
                        </Text>
                        <Text as="span" variant="bodySm">
                          Crawled Pages
                        </Text>
                      </BlockStack>
                    </Box>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
