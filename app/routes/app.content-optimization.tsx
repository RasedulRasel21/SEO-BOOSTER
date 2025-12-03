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
  Checkbox,
  DataTable,
  EmptyState,
  Modal,
  TextContainer,
  Spinner,
  Tag,
  Thumbnail,
  Link,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { generateBlogPost, type GeneratedBlogPost } from "../services/openai.server";

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

  // Get blog posts
  const blogPosts = await prisma.blogPost.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Fetch products for linking
  const productsResponse = await admin.graphql(`
    query {
      products(first: 20) {
        edges {
          node {
            id
            title
            handle
            description
            featuredImage {
              url
            }
          }
        }
      }
    }
  `);
  const productsData = await productsResponse.json();
  const products = productsData.data?.products?.edges?.map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    handle: e.node.handle,
    description: e.node.description,
    image: e.node.featuredImage?.url,
  })) || [];

  // Fetch collections
  const collectionsResponse = await admin.graphql(`
    query {
      collections(first: 20) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `);
  const collectionsData = await collectionsResponse.json();
  const collections = collectionsData.data?.collections?.edges?.map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    handle: e.node.handle,
  })) || [];

  return json({
    shop,
    store,
    blogPosts,
    products,
    collections,
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
    const keyword = formData.get("keyword") as string;
    const tone = formData.get("tone") as "professional" | "casual" | "friendly" | "authoritative";
    const length = formData.get("length") as "short" | "medium" | "long";
    const includeProducts = formData.get("includeProducts") === "true";
    const additionalInstructions = formData.get("additionalInstructions") as string;

    // Check AI credits
    if (store.aiCredits <= 0) {
      return json({ success: false, error: "No AI credits remaining" });
    }

    try {
      // Fetch products if needed
      let products: Array<{ title: string; handle: string; description?: string }> = [];
      if (includeProducts) {
        const productsResponse = await admin.graphql(`
          query {
            products(first: 5) {
              edges {
                node {
                  title
                  handle
                  description
                }
              }
            }
          }
        `);
        const productsData = await productsResponse.json();
        products = productsData.data?.products?.edges?.map((e: any) => ({
          title: e.node.title,
          handle: e.node.handle,
          description: e.node.description,
        })) || [];
      }

      const generated = await generateBlogPost({
        keyword,
        tone,
        length,
        includeProductLinks: includeProducts,
        products,
        additionalInstructions,
      });

      // Save to database
      const blogPost = await prisma.blogPost.create({
        data: {
          storeId: store.id,
          title: generated.title,
          content: generated.content,
          excerpt: generated.excerpt,
          slug: generated.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          metaTitle: generated.metaTitle,
          metaDescription: generated.metaDescription,
          primaryKeyword: keyword,
          status: "draft",
          seoScore: 85, // Calculate based on actual analysis
        },
      });

      // Deduct AI credit
      await prisma.store.update({
        where: { id: store.id },
        data: { aiCredits: { decrement: 1 } },
      });

      return json({ success: true, blogPost, generated });
    } catch (error: any) {
      console.error("Error generating blog post:", error);
      return json({ success: false, error: error.message || "Failed to generate blog post" });
    }
  }

  if (actionType === "publish") {
    const blogPostId = formData.get("blogPostId") as string;

    const blogPost = await prisma.blogPost.findUnique({
      where: { id: blogPostId },
    });

    if (!blogPost) {
      return json({ success: false, error: "Blog post not found" });
    }

    // Get the first blog
    const blogsResponse = await admin.graphql(`
      query {
        blogs(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `);
    const blogsData = await blogsResponse.json();
    const blogId = blogsData.data?.blogs?.edges?.[0]?.node?.id;

    if (!blogId) {
      return json({ success: false, error: "No blog found in store" });
    }

    // Create article in Shopify
    const createArticleResponse = await admin.graphql(`
      mutation createArticle($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        article: {
          blogId,
          title: blogPost.title,
          body: blogPost.content,
          summary: blogPost.excerpt,
          seo: {
            title: blogPost.metaTitle,
            description: blogPost.metaDescription,
          },
        },
      },
    });

    const createData = await createArticleResponse.json();

    if (createData.data?.articleCreate?.userErrors?.length > 0) {
      return json({
        success: false,
        error: createData.data.articleCreate.userErrors[0].message,
      });
    }

    const articleId = createData.data?.articleCreate?.article?.id;

    // Update blog post status
    await prisma.blogPost.update({
      where: { id: blogPostId },
      data: {
        status: "published",
        publishedAt: new Date(),
        shopifyArticleId: articleId,
      },
    });

    return json({ success: true, articleId });
  }

  if (actionType === "delete") {
    const blogPostId = formData.get("blogPostId") as string;

    await prisma.blogPost.delete({
      where: { id: blogPostId },
    });

    return json({ success: true });
  }

  return json({ success: false });
};

export default function ContentOptimization() {
  const { shop, store, blogPosts, products, collections } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [selectedTab, setSelectedTab] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [includeProducts, setIncludeProducts] = useState(true);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewPost, setPreviewPost] = useState<any>(null);

  const isGenerating = navigation.state === "submitting" &&
    navigation.formData?.get("action") === "generate";

  const handleGenerate = () => {
    if (!keyword.trim()) return;

    submit(
      {
        action: "generate",
        keyword,
        tone,
        length,
        includeProducts: includeProducts.toString(),
        additionalInstructions,
      },
      { method: "post" }
    );
  };

  const handlePublish = (blogPostId: string) => {
    submit({ action: "publish", blogPostId }, { method: "post" });
  };

  const handleDelete = (blogPostId: string) => {
    if (confirm("Are you sure you want to delete this blog post?")) {
      submit({ action: "delete", blogPostId }, { method: "post" });
    }
  };

  const handlePreview = (post: any) => {
    setPreviewPost(post);
    setShowPreviewModal(true);
  };

  const tabs = [
    { id: "blog", content: "Blog Posts", panelID: "blog-panel" },
    { id: "products", content: "Products", panelID: "products-panel" },
    { id: "collections", content: "Collections", panelID: "collections-panel" },
    { id: "pages", content: "Other Pages", panelID: "pages-panel" },
  ];

  const toneOptions = [
    { label: "Professional", value: "professional" },
    { label: "Casual", value: "casual" },
    { label: "Friendly", value: "friendly" },
    { label: "Authoritative", value: "authoritative" },
  ];

  const lengthOptions = [
    { label: "Short (~800 words)", value: "short" },
    { label: "Medium (~1500 words)", value: "medium" },
    { label: "Long (~2500 words)", value: "long" },
  ];

  return (
    <Page
      title="Content Optimization"
      subtitle="Generate high-ranking blogs and enhance your existing content with SEOAnt AI"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* AI Credits Banner */}
            <Banner tone="info">
              <InlineStack gap="200">
                <Text as="span" variant="bodyMd">AI Credits remaining:</Text>
                <Badge tone="success">{store.aiCredits}</Badge>
              </InlineStack>
            </Banner>

            {/* AI Blog Generator */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  AI Blog Generator
                </Text>

                <Text as="p" variant="bodySm" tone="subdued">
                  Enter the primary keyword you want to rank for - our AI instantly creates
                  an SEO-optimized blog post to drive more traffic to your site.
                </Text>

                <TextField
                  label="Primary Keyword"
                  value={keyword}
                  onChange={setKeyword}
                  placeholder="Enter a primary keyword (e.g., 'best running shoes')"
                  autoComplete="off"
                />

                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <Select
                      label="Tone"
                      options={toneOptions}
                      value={tone}
                      onChange={setTone}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      label="Length"
                      options={lengthOptions}
                      value={length}
                      onChange={setLength}
                    />
                  </div>
                </InlineStack>

                <Checkbox
                  label="Include product links"
                  helpText="Automatically feature and link your products in the blog post"
                  checked={includeProducts}
                  onChange={setIncludeProducts}
                />

                <TextField
                  label="Additional Instructions (optional)"
                  value={additionalInstructions}
                  onChange={setAdditionalInstructions}
                  multiline={3}
                  placeholder="Add any specific instructions for the AI..."
                  autoComplete="off"
                />

                <Button
                  variant="primary"
                  onClick={handleGenerate}
                  loading={isGenerating}
                  disabled={!keyword.trim()}
                >
                  Generate Blog Post
                </Button>

                {actionData?.error && (
                  <Banner tone="critical">
                    <p>{actionData.error}</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>

            {/* Blog Posts Tabs */}
            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                {selectedTab === 0 && (
                  <Box paddingBlockStart="400">
                    {blogPosts.length === 0 ? (
                      <EmptyState
                        heading="Generate high-ranking Blog Posts with AI"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        action={{
                          content: "Generate Blog Post",
                          onAction: () => document.querySelector<HTMLInputElement>('input[placeholder*="keyword"]')?.focus(),
                        }}
                      >
                        <p>
                          Just enter a topic or keyword - our AI generates a high-ranking
                          blog post in seconds.
                        </p>
                      </EmptyState>
                    ) : (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text", "text"]}
                        headings={["Title", "Keyword", "Status", "SEO Score", "Actions"]}
                        rows={blogPosts.map((post) => [
                          <Box maxWidth="300px">
                            <Text as="span" variant="bodyMd" truncate>
                              {post.title}
                            </Text>
                          </Box>,
                          <Tag>{post.primaryKeyword || "—"}</Tag>,
                          <Badge
                            tone={
                              post.status === "published"
                                ? "success"
                                : post.status === "scheduled"
                                ? "info"
                                : undefined
                            }
                          >
                            {post.status}
                          </Badge>,
                          <Badge
                            tone={
                              post.seoScore >= 80
                                ? "success"
                                : post.seoScore >= 50
                                ? "warning"
                                : "critical"
                            }
                          >
                            {post.seoScore}
                          </Badge>,
                          <InlineStack gap="200">
                            <Button size="slim" onClick={() => handlePreview(post)}>
                              Preview
                            </Button>
                            {post.status === "draft" && (
                              <Button
                                size="slim"
                                variant="primary"
                                onClick={() => handlePublish(post.id)}
                              >
                                Publish
                              </Button>
                            )}
                            <Button
                              size="slim"
                              tone="critical"
                              onClick={() => handleDelete(post.id)}
                            >
                              Delete
                            </Button>
                          </InlineStack>,
                        ])}
                      />
                    )}
                  </Box>
                )}

                {selectedTab === 1 && (
                  <Box paddingBlockStart="400">
                    <DataTable
                      columnContentTypes={["text", "text", "text", "text"]}
                      headings={["Product", "Handle", "SEO Status", "Actions"]}
                      rows={products.map((product: any) => [
                        <InlineStack gap="200" blockAlign="center">
                          {product.image && (
                            <Thumbnail source={product.image} alt={product.title} size="small" />
                          )}
                          <Text as="span" variant="bodyMd" truncate>
                            {product.title}
                          </Text>
                        </InlineStack>,
                        <Text as="span" variant="bodySm" tone="subdued">
                          /{product.handle}
                        </Text>,
                        <Badge tone="warning">Needs Review</Badge>,
                        <Button size="slim" url={`/app/search-appearance?type=product&id=${product.id}`}>
                          Optimize
                        </Button>,
                      ])}
                    />
                  </Box>
                )}

                {selectedTab === 2 && (
                  <Box paddingBlockStart="400">
                    <DataTable
                      columnContentTypes={["text", "text", "text", "text"]}
                      headings={["Collection", "Handle", "SEO Status", "Actions"]}
                      rows={collections.map((collection: any) => [
                        <Text as="span" variant="bodyMd" truncate>
                          {collection.title}
                        </Text>,
                        <Text as="span" variant="bodySm" tone="subdued">
                          /{collection.handle}
                        </Text>,
                        <Badge tone="warning">Needs Review</Badge>,
                        <Button size="slim" url={`/app/search-appearance?type=collection&id=${collection.id}`}>
                          Optimize
                        </Button>,
                      ])}
                    />
                  </Box>
                )}

                {selectedTab === 3 && (
                  <Box paddingBlockStart="400">
                    <EmptyState
                      heading="No other pages found"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>Create pages in your Shopify admin to optimize them here.</p>
                    </EmptyState>
                  </Box>
                )}
              </Tabs>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Preview Modal */}
      <Modal
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title={previewPost?.title || "Blog Post Preview"}
        size="large"
        primaryAction={{
          content: previewPost?.status === "draft" ? "Publish" : "Close",
          onAction: () => {
            if (previewPost?.status === "draft") {
              handlePublish(previewPost.id);
            }
            setShowPreviewModal(false);
          },
        }}
        secondaryActions={[
          {
            content: "Close",
            onAction: () => setShowPreviewModal(false),
          },
        ]}
      >
        <Modal.Section>
          {previewPost && (
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Meta Title
                </Text>
                <Box background="bg-surface-secondary" padding="300" borderRadius="100">
                  <Text as="p" variant="bodySm">
                    {previewPost.metaTitle}
                  </Text>
                </Box>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Meta Description
                </Text>
                <Box background="bg-surface-secondary" padding="300" borderRadius="100">
                  <Text as="p" variant="bodySm">
                    {previewPost.metaDescription}
                  </Text>
                </Box>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Content
                </Text>
                <Box
                  background="bg-surface-secondary"
                  padding="400"
                  borderRadius="100"
                  maxHeight="400px"
                  overflowY="scroll"
                >
                  <div dangerouslySetInnerHTML={{ __html: previewPost.content }} />
                </Box>
              </BlockStack>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
