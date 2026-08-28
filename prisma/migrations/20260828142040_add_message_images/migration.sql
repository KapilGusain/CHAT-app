-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "imageMimeType" TEXT,
ADD COLUMN     "imageName" TEXT,
ADD COLUMN     "imageSize" INTEGER,
ADD COLUMN     "imageUrl" TEXT,
ALTER COLUMN "content" DROP NOT NULL;
