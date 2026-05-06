<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_reports', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('reporter_id');
            $table->unsignedInteger('message_id');
            $table->string('reason', 255);
            $table->enum('status', ['pending', 'reviewed', 'dismissed', 'sanctioned'])->default('pending');
            $table->unsignedInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('resolution_notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->unique(['reporter_id', 'message_id'], 'message_reports_unique_report');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_reports');
    }
};
