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
  TextField,
  Select,
  DataTable,
  EmptyState,
  Modal,
  Tag,
  ProgressBar,
  Tooltip,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { generateKeywordSuggestions } from "../services/openai.server";

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

  // Get keyword research history
  const keywordResearch = await prisma.keywordResearch.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return json({
    shop,
    store,
    keywordResearch,
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

  if (actionType === "generate") {
    const seedKeyword = formData.get("seedKeyword") as string;
    const country = formData.get("country") as string;
    const language = formData.get("language") as string;

    if (!seedKeyword.trim()) {
      return json({ success: false, error: "Please enter a seed keyword" });
    }

    try {
      const keywords = await generateKeywordSuggestions(seedKeyword);

      // Save to database
      const research = await prisma.keywordResearch.create({
        data: {
          storeId: store.id,
          seedKeyword,
          country: country || "US",
          language: language || "en",
          keywords: keywords as any,
        },
      });

      return json({ success: true, research, keywords });
    } catch (error: any) {
      console.error("Error generating keywords:", error);
      return json({ success: false, error: error.message || "Failed to generate keywords" });
    }
  }

  if (actionType === "delete") {
    const researchId = formData.get("researchId") as string;

    await prisma.keywordResearch.delete({
      where: { id: researchId },
    });

    return json({ success: true });
  }

  if (actionType === "generateBlog") {
    const keyword = formData.get("keyword") as string;

    // Redirect to content optimization with keyword
    return json({ success: true, redirectTo: `/app/content-optimization?keyword=${encodeURIComponent(keyword)}` });
  }

  return json({ success: false });
};

export default function KeywordResearch() {
  const { shop, store, keywordResearch } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [selectedTab, setSelectedTab] = useState(0);
  const [seedKeyword, setSeedKeyword] = useState("");
  const [country, setCountry] = useState("US");
  const [language, setLanguage] = useState("en");
  const [selectedResearch, setSelectedResearch] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const isGenerating = navigation.state === "submitting" &&
    navigation.formData?.get("action") === "generate";

  const handleGenerate = () => {
    if (!seedKeyword.trim()) return;

    submit(
      {
        action: "generate",
        seedKeyword,
        country,
        language,
      },
      { method: "post" }
    );
  };

  const handleDelete = (researchId: string) => {
    if (confirm("Are you sure you want to delete this keyword research?")) {
      submit({ action: "delete", researchId }, { method: "post" });
    }
  };

  const handleGenerateBlog = (keyword: string) => {
    window.location.href = `/app/content-optimization?keyword=${encodeURIComponent(keyword)}`;
  };

  const handleViewDetails = (research: any) => {
    setSelectedResearch(research);
    setShowDetailsModal(true);
  };

  const tabs = [
    { id: "planner", content: "Keyword Content Planner", panelID: "planner-panel" },
    { id: "keywords", content: "My Keywords", panelID: "keywords-panel" },
    { id: "explore", content: "Keywords Explore", panelID: "explore-panel" },
    { id: "competitors", content: "Competitors", panelID: "competitors-panel" },
  ];

  const countryOptions = [
    { label: "United States", value: "US" },
    { label: "United Kingdom", value: "GB" },
    { label: "Canada", value: "CA" },
    { label: "Australia", value: "AU" },
    { label: "Germany", value: "DE" },
    { label: "France", value: "FR" },
    { label: "India", value: "IN" },
    { label: "Japan", value: "JP" },
  ];

  const languageOptions = [
    { label: "English", value: "en" },
    { label: "Spanish", value: "es" },
    { label: "French", value: "fr" },
    { label: "German", value: "de" },
    { label: "Japanese", value: "ja" },
    { label: "Chinese", value: "zh" },
  ];

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy":
        return "success";
      case "medium":
        return "warning";
      case "hard":
        return "critical";
      default:
        return "info";
    }
  };

  const getVolumeIndicator = (volume: string) => {
    switch (volume) {
      case "high":
        return { value: 80, tone: "success" as const };
      case "medium":
        return { value: 50, tone: "warning" as const };
      case "low":
        return { value: 20, tone: "critical" as const };
      default:
        return { value: 0, tone: "info" as const };
    }
  };

  // Get the latest research results from action data or selected research
  const currentKeywords = actionData?.keywords || selectedResearch?.keywords || [];

  return (
    <Page
      title="Keyword Research"
      subtitle="Find the best keywords for your content and track your rankings"
    >
      <Layout>
        <Layout.Section>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            {/* Keyword Content Planner Tab */}
            {selectedTab === 0 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="500">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Keyword Content Planner
                      </Text>

                      <Text as="p" variant="bodySm" tone="subdued">
                        Just enter a seed keyword - we'll generate a keyword-driven content plan.
                      </Text>

                      <TextField
                        label=""
                        value={seedKeyword}
                        onChange={setSeedKeyword}
                        placeholder="Enter a seed keyword (e.g., 'running shoes')"
                        autoComplete="off"
                        connectedRight={
                          <Button
                            variant="primary"
                            onClick={handleGenerate}
                            loading={isGenerating}
                            disabled={!seedKeyword.trim()}
                          >
                            Generate
                          </Button>
                        }
                      />

                      <InlineStack gap="400">
                        <div style={{ width: "200px" }}>
                          <Select
                            label="Results for"
                            options={countryOptions}
                            value={country}
                            onChange={setCountry}
                          />
                        </div>
                        <div style={{ width: "200px" }}>
                          <Select
                            label="Language"
                            options={languageOptions}
                            value={language}
                            onChange={setLanguage}
                          />
                        </div>
                      </InlineStack>

                      {actionData?.error && (
                        <Banner tone="critical">
                          <p>{actionData.error}</p>
                        </Banner>
                      )}
                    </BlockStack>
                  </Card>

                  {/* Results */}
                  {currentKeywords.length > 0 && (
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Keyword Suggestions
                        </Text>

                        <DataTable
                          columnContentTypes={["text", "text", "text", "text", "text"]}
                          headings={["Keyword", "Search Volume", "Difficulty", "Intent", "Actions"]}
                          rows={currentKeywords.map((kw: any) => {
                            const volumeInfo = getVolumeIndicator(kw.searchVolume);
                            return [
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {kw.keyword}
                              </Text>,
                              <Box width="100px">
                                <BlockStack gap="100">
                                  <Badge tone={volumeInfo.tone}>{kw.searchVolume}</Badge>
                                  <ProgressBar progress={volumeInfo.value} size="small" tone={volumeInfo.tone} />
                                </BlockStack>
                              </Box>,
                              <Badge tone={getDifficultyColor(kw.difficulty)}>
                                {kw.difficulty}
                              </Badge>,
                              <Tag>{kw.intent}</Tag>,
                              <Button
                                size="slim"
                                onClick={() => handleGenerateBlog(kw.keyword)}
                              >
                                Generate Blog
                              </Button>,
                            ];
                          })}
                        />
                      </BlockStack>
                    </Card>
                  )}

                  {/* All Topic Clusters */}
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        All Topic Clusters
                      </Text>

                      {keywordResearch.length === 0 ? (
                        <EmptyState
                          heading="No keyword research yet"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>Enter a seed keyword above to start generating keyword ideas.</p>
                        </EmptyState>
                      ) : (
                        <DataTable
                          columnContentTypes={["text", "text", "text"]}
                          headings={["Content Plan List", "Last update time", "Actions"]}
                          rows={keywordResearch.map((research) => [
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" variant="bodyMd">
                                {research.seedKeyword}
                              </Text>
                              {research.createdAt && new Date(research.createdAt) > new Date(Date.now() - 86400000) && (
                                <Badge tone="info">New</Badge>
                              )}
                            </InlineStack>,
                            <Text as="span" variant="bodySm" tone="subdued">
                              {new Date(research.createdAt).toLocaleDateString()}
                            </Text>,
                            <InlineStack gap="200">
                              <Button size="slim" onClick={() => handleViewDetails(research)}>
                                View
                              </Button>
                              <Button
                                size="slim"
                                tone="critical"
                                onClick={() => handleDelete(research.id)}
                              >
                                Delete
                              </Button>
                            </InlineStack>,
                          ])}
                        />
                      )}
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Box>
            )}

            {/* My Keywords Tab */}
            {selectedTab === 1 && (
              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      My Keywords
                    </Text>

                    <Text as="p" variant="bodySm" tone="subdued">
                      Track your target keywords and monitor their rankings over time.
                    </Text>

                    <EmptyState
                      heading="No tracked keywords"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      action={{
                        content: "Add Keywords",
                        onAction: () => setSelectedTab(0),
                      }}
                    >
                      <p>Start by generating keywords from the Content Planner tab.</p>
                    </EmptyState>
                  </BlockStack>
                </Card>
              </Box>
            )}

            {/* Keywords Explore Tab */}
            {selectedTab === 2 && (
              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Keywords Explore
                    </Text>

                    <Text as="p" variant="bodySm" tone="subdued">
                      Explore trending keywords and discover new opportunities.
                    </Text>

                    <Banner tone="info">
                      <p>
                        This feature analyzes search trends and suggests keywords that are
                        gaining popularity in your niche.
                      </p>
                    </Banner>

                    <TextField
                      label="Search for keywords"
                      placeholder="Enter a topic or industry"
                      autoComplete="off"
                    />

                    <Button variant="primary">Explore Keywords</Button>
                  </BlockStack>
                </Card>
              </Box>
            )}

            {/* Competitors Tab */}
            {selectedTab === 3 && (
              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Competitor Analysis
                    </Text>

                    <Text as="p" variant="bodySm" tone="subdued">
                      Analyze your competitors' keywords and find gaps in your strategy.
                    </Text>

                    <Banner tone="info">
                      <p>
                        Enter your competitor's URL to see what keywords they're ranking for
                        and identify opportunities for your store.
                      </p>
                    </Banner>

                    <TextField
                      label="Competitor URL"
                      placeholder="https://competitor-store.com"
                      autoComplete="off"
                    />

                    <Button variant="primary">Analyze Competitor</Button>
                  </BlockStack>
                </Card>
              </Box>
            )}
          </Tabs>
        </Layout.Section>
      </Layout>

      {/* Keyword Details Modal */}
      <Modal
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`Keywords for "${selectedResearch?.seedKeyword || ""}"`}
        size="large"
      >
        <Modal.Section>
          {selectedResearch && (
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Badge>{selectedResearch.country}</Badge>
                <Badge>{selectedResearch.language}</Badge>
              </InlineStack>

              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Keyword", "Volume", "Difficulty", "Intent", "Actions"]}
                rows={((selectedResearch.keywords as any[]) || []).map((kw: any) => {
                  const volumeInfo = getVolumeIndicator(kw.searchVolume);
                  return [
                    <Text as="span" variant="bodyMd">
                      {kw.keyword}
                    </Text>,
                    <Badge tone={volumeInfo.tone}>{kw.searchVolume}</Badge>,
                    <Badge tone={getDifficultyColor(kw.difficulty)}>
                      {kw.difficulty}
                    </Badge>,
                    <Tag>{kw.intent}</Tag>,
                    <Button
                      size="slim"
                      onClick={() => {
                        setShowDetailsModal(false);
                        handleGenerateBlog(kw.keyword);
                      }}
                    >
                      Generate Blog
                    </Button>,
                  ];
                })}
              />
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
