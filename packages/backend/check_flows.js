const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const doctorCount = await prisma.user.count();
  const flowCount = await prisma.chatbotFlow.count();
  const templateCount = await prisma.chatbotTemplate.count();
  const convCount = await prisma.conversation.count();
  console.log("Doctors count:", doctorCount);
  console.log("Flows count:", flowCount);
  console.log("Templates count:", templateCount);
  console.log("Conversations count:", convCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
