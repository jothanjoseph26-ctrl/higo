import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PromosService } from './promos.service';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto';

@Controller('admin/promos')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class PromosController {
  constructor(private readonly promosService: PromosService) {}

  @Get()
  async list(
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ) {
    return this.promosService.list(Number(limit), Number(offset));
  }

  @Post()
  async create(@Body() dto: CreatePromoDto) {
    return this.promosService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePromoDto) {
    return this.promosService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.promosService.remove(id);
  }
}